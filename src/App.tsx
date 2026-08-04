import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import * as xlsx from 'xlsx';
import { supabase } from './supabase';

function App() {
  const [abaAtiva, setAbaAtiva] = useState<'disparo' | 'chat'>('disparo');
  
  // Chat
  const [conversas, setConversas] = useState<any[]>([]);
  const [telefoneAtivo, setTelefoneAtivo] = useState<string | null>(null); // NOVO: Controla qual conversa está aberta

  // Disparo e Templates
  const [colunasExcel, setColunasExcel] = useState<string[]>([]);
  const [dadosPlanilha, setDadosPlanilha] = useState<any[]>([]);
  const [templatesMeta, setTemplatesMeta] = useState<any[]>([{ id: 'selecione', nome: '🔄 Carregando...', variaveis: [] }]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [colunaTelefoneSelecionada, setColunaTelefoneSelecionada] = useState<string>('');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [statusDisparo, setStatusDisparo] = useState('');

  const [mensagemDigitada, setMensagemDigitada] = useState('');
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);

  // EFEITO: Busca Mensagens
  useEffect(() => {
    const buscarMensagens = async () => {
      const { data, error } = await supabase.from('mensagens').select('*').order('criado_em', { ascending: false });
      if (!error) setConversas(data || []);
    };

    const buscarTemplates = async () => {
      try {
        const urlMotor = 'https://motor-finanser-api.onrender.com/api/templates';
        const res = await fetch(urlMotor);
        if (res.ok) {
          const templates = await res.json();
          const templatesComDefault = [{ id: 'selecione', nome: '-- Escolha um Template --', variaveis: [] }, ...templates];
          setTemplatesMeta(templatesComDefault);
          setTemplateSelecionado(templatesComDefault[0]);
        }
      } catch (error) {
        setTemplatesMeta([{ id: 'selecione', nome: '❌ Motor Offline.', variaveis: [] }]);
      }
    };

    buscarMensagens();
    buscarTemplates();




    
    // Opcional: Atualiza o chat a cada 5 segundos para ver o status mudando em tempo real
    const intervalo = setInterval(buscarMensagens, 5000);
    return () => clearInterval(intervalo);
  }, []);

  const lidarComArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    // ... (Sua lógica de leitura de arquivo que já funciona perfeitamente) ...
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setStatusDisparo('Carregando planilha...');
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const arrayBuffer = e.target?.result;
      const workbook = xlsx.read(arrayBuffer, { type: 'array', cellDates: true });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const dadosBrutos = xlsx.utils.sheet_to_json(aba, { raw: false, dateNF: 'yyyy-mm-dd' });
      
      const dadosFormatados = dadosBrutos.map((linha: any) => linha);
      
      if (dadosFormatados.length > 0) {
        setColunasExcel(Object.keys(dadosFormatados[0] as object));
        setDadosPlanilha(dadosFormatados);
        setStatusDisparo(`✅ Planilha lida! ${dadosFormatados.length} registros.`);
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  };

  const atualizarMapeamento = (nomeVariavel: string, colunaSelecionada: string) => {
    setMapeamento(prev => ({ ...prev, [nomeVariavel]: colunaSelecionada }));
  };

  const dispararCampanha = async () => {
    if (!templateSelecionado || templateSelecionado.id === 'selecione') return alert('Selecione um template!');
    if (!colunaTelefoneSelecionada) return alert('Selecione a coluna de WhatsApp!');

    setStatusDisparo('⏳ Empacotando dados e enviando...');

    const pacoteMensagens = dadosPlanilha.map((linha, index) => {
      const variaveisDinamicas = templateSelecionado.variaveis.map((varName: string) => {
        const colunaMapeada = mapeamento[varName];
        if (!colunaMapeada) return '';

        let valorBruto = String(linha[colunaMapeada] || '').trim();

        // 🛡️ TRATAMENTO CIRÚRGICO DE DATA BRUTA (DD/MM/AAAA)
        // Se a string contém barras (ex: "16/07/2026"), nós ignoramos qualquer conversão 
        // de data do JS e pegamos as fatias exatas da string do CSV.
        if (valorBruto.includes('/')) {
          const partes = valorBruto.split('/');
          if (partes.length === 3) {
            let [p1, p2, p3] = partes;
            
            // Se o formato veio como MM/DD/YYYY por engano do parser, corrigimos na marra,
            // mas pelo seu CSV o p1 é o dia (16) e p2 é o mês (07). 
            // Vamos garantir que fiquem travados na ordem exata: Dia / Mês / Ano
            let dia = p1.padStart(2, '0');
            let mes = p2.padStart(2, '0');
            let ano = p3;
            if (ano.length === 2) ano = `20${ano}`;

            return `${dia}/${mes}/${ano}`;
          }
        }

        // Se por acaso vier como objeto Date do JS:
        if (linha[colunaMapeada] instanceof Date) {
          const d = linha[colunaMapeada] as Date;
          const dia = String(d.getUTCDate()).padStart(2, '0');
          const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
          const ano = d.getUTCFullYear();
          return `${dia}/${mes}/${ano}`;
        }

        return valorBruto;
      });

      let telefoneLimpo = String(linha[colunaTelefoneSelecionada] || '').replace(/\D/g, '');
      if (telefoneLimpo && !telefoneLimpo.startsWith('55')) telefoneLimpo = `55${telefoneLimpo}`;

      return { id: `msg_${Date.now()}_${index}`, phone: telefoneLimpo, templateName: templateSelecionado.id, variables: variaveisDinamicas };
    }).filter(msg => msg.phone !== '');

    try {
      const urlMotor = 'https://motor-finanser-api.onrender.com/api/send-bulk'; 
      const resposta = await fetch(urlMotor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: pacoteMensagens })
      });

      if (resposta.ok) setStatusDisparo(`🚀 SUCESSO! ${pacoteMensagens.length} mensagens disparadas!`);
      
        // ✨ ATUALIZA A TELA NA HORA: Puxa o histórico logo após o motor gravar no banco
        const { data } = await supabase.from('mensagens').select('*').order('criado_em', { ascending: false });
        if (data) setConversas(data);

      else setStatusDisparo('❌ Erro no envio.');
    } catch (erro) {
      setStatusDisparo('❌ Motor offline.');
    }
  };

  const enviarMensagemManual = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && mensagemDigitada.trim() !== '' && telefoneAtivo) {
      setEnviandoMensagem(true);
      try {
        const urlMotor = 'https://motor-finanser-api.onrender.com/api/send-message';
        const resposta = await fetch(urlMotor, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: telefoneAtivo, text: mensagemDigitada })
        });

        if (resposta.ok) {
          setMensagemDigitada(''); // Limpa o campo
          // Atualiza o chat puxando do banco
          const { data } = await supabase.from('mensagens').select('*').order('criado_em', { ascending: false });
          if (data) setConversas(data);
        } else {
          alert('❌ A Meta bloqueou o envio. O cliente interagiu nas últimas 24h?');
        }
      } catch (err) {
        alert('❌ Erro de conexão com o Motor.');
      } finally {
        setEnviandoMensagem(false);
      }
    }
  };



  // 1. Lógica da Barra Lateral (Agrupar um contato por número)
  const contatosUnicos = conversas.reduce((acc, msg) => {
    if (!acc[msg.telefone_cliente]) acc[msg.telefone_cliente] = msg; // Pega só a mais recente
    return acc;
  }, {});
  const listaContatos: any[] = Object.values(contatosUnicos);

  // 2. Lógica do Painel Central (Pegar todo o histórico do número selecionado)
  const mensagensDoContato = conversas
    .filter(msg => msg.telefone_cliente === telefoneAtivo)
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()); // Ordena da mais antiga para mais nova

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* BARRA LATERAL */}
      <div className="w-1/3 max-w-sm bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">Motor FINANSER</h2>
        </div>
        <div className="p-4 border-b border-gray-200">
          <button onClick={() => setAbaAtiva('disparo')} className={`w-full py-2.5 rounded-lg font-semibold transition ${abaAtiva === 'disparo' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'}`}>+ Nova Campanha</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase sticky top-0">Contatos</div>
          {listaContatos.map((contato, index) => (
            <div key={index} onClick={() => { setTelefoneAtivo(contato.telefone_cliente); setAbaAtiva('chat'); }}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${telefoneAtivo === contato.telefone_cliente && abaAtiva === 'chat' ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
            >
              <h3 className="font-semibold text-gray-800">{contato.telefone_cliente}</h3>
              <p className="text-sm text-gray-500 truncate">{contato.texto_mensagem}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PAINEL CENTRAL */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
        {abaAtiva === 'disparo' ? (
           // TELA DE DISPARO (MANTIDA INTACTA)
           <div className="p-8 max-w-4xl mx-auto w-full">
           <h1 className="text-2xl font-bold text-gray-800 mb-2">Disparo Inteligente</h1>
           {/* ... Mapeamento normal dos botões de disparo ... */}
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
             <input type="file" accept=".csv, .xlsx, .xls" onChange={lidarComArquivo} className="mb-4" />
             {statusDisparo && <p className="text-sm font-medium text-blue-600 bg-blue-50 p-2 rounded">{statusDisparo}</p>}
           </div>

           {colunasExcel.length > 0 && (
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
               <div className="bg-green-50 p-4 rounded-lg mb-6">
                 <h3 className="text-sm font-bold text-green-800 mb-2">Coluna de WhatsApp</h3>
                 <select className="w-full p-2" onChange={(e) => setColunaTelefoneSelecionada(e.target.value)}>
                   <option value="">Selecione...</option>
                   {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                 </select>
               </div>
               
               <select className="w-full p-3 mb-6 bg-gray-50 border" onChange={(e) => setTemplateSelecionado(templatesMeta.find(t => t.id === e.target.value))}>
                 {templatesMeta.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.nome}</option>)}
               </select>

               {templateSelecionado?.variaveis.length > 0 && (
                 <div className="bg-orange-50 p-5 rounded-lg">
                   {templateSelecionado.variaveis.map((variavel: string) => (
                     <div key={variavel} className="flex items-center justify-between mb-3 bg-white p-2 border">
                       <span><b>{variavel}</b></span>
                       <select className="w-1/2 p-2 border" onChange={(e) => atualizarMapeamento(variavel, e.target.value)}>
                         <option value="">Selecione...</option>
                         {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                       </select>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           )}

           {colunasExcel.length > 0 && (
             <button onClick={dispararCampanha} className="w-full bg-green-600 text-white px-8 py-4 rounded-xl font-bold">🚀 INICIAR DISPAROS</button>
           )}
         </div>
        ) : (
          /* ================= TELA DE CHAT (ESTILO WHATSAPP) ================= */
          <div className="flex-1 flex flex-col h-full bg-[url('https://i.pinimg.com/originals/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-center">
            {telefoneAtivo ? (
              <>
                <div className="h-16 bg-white flex items-center px-6 border-b shadow-sm sticky top-0 z-10">
                  <h2 className="font-bold text-gray-800 text-lg">{telefoneAtivo}</h2>
                </div>
                
                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-3">
                  {mensagensDoContato.map((msg, idx) => (
                    // Alinha pra direita se for 'enviada', esquerda se não for
                    <div key={idx} className={`flex ${msg.direcao === 'enviada' ? 'justify-end' : 'justify-start'}`}>
                      
                      {/* Cor da bolha: Verde se enviou, Branca se recebeu */}
                      <div className={`p-3 rounded-lg shadow-sm max-w-[80%] relative ${
                        msg.direcao === 'enviada' ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none border border-gray-100'
                      }`}>
                        <p className="text-gray-800 text-[15px]">{msg.texto_mensagem}</p>
                        
                        <div className="flex justify-end items-center gap-1 mt-1">
                          <span className="text-[10px] text-gray-500">
                            {new Date(msg.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          
                          {/* Verifica Status apenas nas mensagens enviadas por você */}
                          {msg.direcao === 'enviada' && (
                            <span className="text-[12px] ml-1">
                              {msg.status === 'sent' && <span className="text-gray-400">✓</span>}
                              {msg.status === 'delivered' && <span className="text-gray-400">✓✓</span>}
                              {msg.status === 'read' && <span className="text-blue-500 font-bold">✓✓</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-gray-100 border-t sticky bottom-0">
                  <div className="p-4 bg-gray-100 border-t sticky bottom-0">
  <input 
    type="text" 
    placeholder={enviandoMensagem ? "Enviando..." : "Digite uma mensagem e aperte Enter..."} 
    className="w-full py-3 px-4 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
    value={mensagemDigitada}
    onChange={(e) => setMensagemDigitada(e.target.value)}
    onKeyDown={enviarMensagemManual}
    disabled={enviandoMensagem}
  />
</div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="bg-white/90 p-6 rounded-xl shadow-sm text-center font-medium">Selecione um contato na barra lateral</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;