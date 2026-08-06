import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import * as xlsx from 'xlsx';
import { supabase } from './supabase';
import Login from './login';
import { MessageSquare, Send, Lock } from 'lucide-react'; 

function App() {
  const [autenticado, setAutenticado] = useState<boolean>(() => {
    return localStorage.getItem('finanser_auth') === 'true';
  });

  const fazerLogin = (senhaDigitada: string) => {
    if (senhaDigitada === 'finanser2026') {
      localStorage.setItem('finanser_auth', 'true');
      setAutenticado(true);
    }
  };

  const fazerLogout = () => {
    localStorage.removeItem('finanser_auth');
    setAutenticado(false);
  };

  const [abaAtiva, setAbaAtiva] = useState<'disparo' | 'chat'>('chat');
  
  const [conversas, setConversas] = useState<any[]>([]);
  const [telefoneAtivo, setTelefoneAtivo] = useState<string | null>(null);

  const [colunasExcel, setColunasExcel] = useState<string[]>([]);
  const [dadosPlanilha, setDadosPlanilha] = useState<any[]>([]);
  const [templatesMeta, setTemplatesMeta] = useState<any[]>([{ id: 'selecione', nome: '🔄 Carregando...', variaveis: [] }]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [colunaTelefoneSelecionada, setColunaTelefoneSelecionada] = useState<string>('');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [statusDisparo, setStatusDisparo] = useState('');

  const [mensagemDigitada, setMensagemDigitada] = useState('');
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);

  if (!autenticado) {
    return <Login onLogin={fazerLogin} />;
  }

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

    const intervalo = setInterval(buscarMensagens, 5000);
    return () => clearInterval(intervalo);
  }, []);

  const lidarComArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
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

        const dadoBruto = linha[colunaMapeada];

        if (dadoBruto instanceof Date) {
          const dia = String(dadoBruto.getUTCDate()).padStart(2, '0');
          const mes = String(dadoBruto.getUTCMonth() + 1).padStart(2, '0'); 
          const ano = dadoBruto.getUTCFullYear();
          return `${dia}/${mes}/${ano}`;
        }

        let valorTexto = String(dadoBruto || '').trim();

        if (valorTexto.includes('/')) {
          const partes = valorTexto.split('/');
          if (partes.length === 3) {
            let [p1, p2, p3] = partes;
            let dia = p1.padStart(2, '0');
            let mes = p2.padStart(2, '0'); 
            let ano = p3;
            if (ano.length === 2) ano = `20${ano}`;
            return `${dia}/${mes}/${ano}`;
          }
        }
        return valorTexto;
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

      if (resposta.ok) {
        setStatusDisparo(`🚀 SUCESSO! ${pacoteMensagens.length} mensagens disparadas!`);
        const { data } = await supabase.from('mensagens').select('*').order('criado_em', { ascending: false });
        if (data) setConversas(data);
      } else {
        setStatusDisparo('❌ Erro no envio.');
      }
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
          setMensagemDigitada(''); 
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

  const contatosUnicos = conversas.reduce((acc, msg) => {
    if (!acc[msg.telefone_cliente]) acc[msg.telefone_cliente] = msg; 
    return acc;
  }, {});
  const listaContatos: any[] = Object.values(contatosUnicos);
  
  const mensagensDoContato = conversas
    .filter(msg => msg.telefone_cliente === telefoneAtivo)
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());

  // === FUNÇÕES AUXILIARES PARA FORMATAR MÍDIAS E TEMPLATES ===
  
  // Limpa o texto da barra lateral
  const formatarResumoSidebar = (texto: string) => {
    if (!texto) return '';
    if (texto.startsWith('[IMAGEM|')) return '📷 Imagem';
    if (texto.startsWith('[DOCUMENTO|')) return '📄 Documento';
    
    // Tratamento novo para a barra lateral do chat
    if (texto.startsWith('[Template: ')) {
      const nomeTemplate = texto.replace('[Template: ', '').replace(']', '').trim();
      return `📢 Disparo (${nomeTemplate})`;
    }
    
    return texto;
  };

  // Transforma o código do banco na tag de imagem, link ou corpo do Template
  const renderizarBolhaMensagem = (texto: string) => {
    if (!texto) return null;
    
    // 1. Tratamento para IMAGENS
    if (texto.startsWith('[IMAGEM|')) {
      const partes = texto.split('|');
      const mediaId = partes[1];
      const legenda = partes[2] && partes[2] !== ']' ? partes[2].replace(']', '') : '';
      const urlMidia = `https://motor-finanser-api.onrender.com/api/media/${mediaId}`;

      return (
        <div className="flex flex-col gap-2">
          <img src={urlMidia} alt="Mídia recebida" className="max-w-[280px] rounded-lg border border-gray-200 shadow-sm bg-gray-50" loading="lazy" />
          {legenda && <span className="text-sm text-gray-700">{legenda}</span>}
        </div>
      );
    }
    
    // 2. Tratamento para PDFs / DOCUMENTOS
    if (texto.startsWith('[DOCUMENTO|')) {
      const partes = texto.split('|');
      const mediaId = partes[1];
      const nomeArquivo = partes[2] ? partes[2].replace(']', '') : 'Documento';
      const urlDoc = `https://motor-finanser-api.onrender.com/api/media/${mediaId}`;

      return (
        <a href={urlDoc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white/60 border border-gray-200 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-white transition-colors">
          <span className="text-xl">📄</span>
          <span className="text-sm font-semibold truncate max-w-[200px]">{nomeArquivo}</span>
        </a>
      );
    }
    
    // 3. ✨ NOVO: Tratamento para TEMPLATES (Lê da memória e exibe)
    if (texto.startsWith('[Template: ')) {
      const nomeTemplate = texto.replace('[Template: ', '').replace(']', '').trim();
      const templateEncontrado = templatesMeta.find(t => t.id === nomeTemplate);

      if (templateEncontrado && templateEncontrado.corpo) {
        return (
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-green-700/60 uppercase tracking-wider mb-2 border-b border-green-700/10 pb-1">
              Campanha: {templateEncontrado.nome}
            </span>
            <p className="text-gray-800 text-[15px] whitespace-pre-wrap leading-relaxed">
              {templateEncontrado.corpo}
            </p>
          </div>
        );
      }
      
      return <p className="text-gray-800 text-[15px] italic text-gray-600">📢 Disparo: {nomeTemplate}</p>;
    }
    
    // 4. Se for texto normal digitado, só retorna o texto
    return <p className="text-gray-800 text-[15px] whitespace-pre-wrap">{texto}</p>;
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-hidden">
      
      {/* 1. BARRA LATERAL FINA (ESCURA) */}
      <div className="w-[70px] bg-[#0b141a] flex flex-col items-center py-6 justify-between z-20 shadow-xl">
        <div className="flex flex-col gap-6 w-full px-3">
          <button 
            onClick={() => setAbaAtiva('chat')}
            className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
              abaAtiva === 'chat' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Atendimentos"
          >
            <MessageSquare size={24} />
          </button>
          <button 
            onClick={() => setAbaAtiva('disparo')}
            className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${
              abaAtiva === 'disparo' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Disparos em Massa"
          >
            <Send size={24} className="ml-1" /> 
          </button>
        </div>
        <button 
          onClick={fazerLogout}
          className="text-gray-400 hover:text-red-400 transition-colors mb-2"
          title="Sair do sistema"
        >
          <Lock size={22} />
        </button>
      </div>

      {/* 2. COLUNA DO MENU (CONTATOS / OPÇÕES) */}
      <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
        {abaAtiva === 'chat' ? (
          <>
            <div className="h-16 border-b border-gray-100 flex items-center px-6">
              <h2 className="font-bold text-lg text-[#111b21]">Atendimentos</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-2 bg-[#f0f2f5] text-[11px] font-bold text-gray-500 uppercase tracking-wider sticky top-0">
                Contatos
              </div>
              {listaContatos.map((contato, index) => (
                <div key={index} onClick={() => setTelefoneAtivo(contato.telefone_cliente)}
                  className={`p-4 border-b border-gray-50 cursor-pointer flex flex-col transition-colors ${
                    telefoneAtivo === contato.telefone_cliente ? 'bg-[#f0f2f5]' : 'hover:bg-gray-50'
                  }`}
                >
                  <h3 className="font-semibold text-gray-800 text-sm">{contato.telefone_cliente}</h3>
                  <p className="text-xs text-gray-500 truncate mt-1">
                    {formatarResumoSidebar(contato.texto_mensagem)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="h-16 border-b border-gray-100 flex items-center px-6">
              <h2 className="font-bold text-lg text-[#111b21]">Menu de Disparos</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Configure sua planilha na tela principal ao lado.</p>
              <div className="w-full bg-blue-50 text-blue-700 p-4 rounded-xl border border-blue-100 text-sm font-medium">
                Módulo ativo e pronto para envio.
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. PAINEL CENTRAL (TELA DE TRABALHO) */}
      <div className="flex-1 flex flex-col bg-gray-50 relative overflow-hidden">
        {abaAtiva === 'disparo' ? (
           <div className="p-10 w-full max-w-4xl mx-auto overflow-y-auto h-full">
             <h1 className="text-3xl font-bold text-gray-800 mb-8">Disparo Inteligente</h1>
             
             <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-6">
               <label className="block text-sm font-bold text-gray-700 mb-4">1. Importar Planilha</label>
               <input type="file" accept=".csv, .xlsx, .xls" onChange={lidarComArquivo} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors" />
               {statusDisparo && <p className="mt-4 text-sm font-medium text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100">{statusDisparo}</p>}
             </div>

             {colunasExcel.length > 0 && (
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-6 animate-fade-in">
                 <div className="bg-green-50 p-5 rounded-xl border border-green-100 mb-6">
                   <h3 className="text-sm font-bold text-green-800 mb-3">2. Qual coluna tem os números de WhatsApp?</h3>
                   <select className="w-full p-3 rounded-lg border-green-200 text-gray-700 focus:ring-green-500 focus:border-green-500 outline-none" onChange={(e) => setColunaTelefoneSelecionada(e.target.value)}>
                     <option value="">Selecione a coluna...</option>
                     {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                   </select>
                 </div>
                 
                 <h3 className="text-sm font-bold text-gray-700 mb-3">3. Escolha a Mensagem (Template)</h3>
                 <select className="w-full p-3 rounded-lg bg-gray-50 border border-gray-200 mb-6 outline-none focus:ring-blue-500" onChange={(e) => setTemplateSelecionado(templatesMeta.find(t => t.id === e.target.value))}>
                   {templatesMeta.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.nome}</option>)}
                 </select>

                 {templateSelecionado && templateSelecionado.id !== 'selecione' && templateSelecionado.corpo && (
                   <div className="bg-[#dcf8c6] p-5 rounded-xl border border-green-200/50 mb-6 relative shadow-sm max-w-[85%]">
                     <span className="absolute top-2 right-3 text-[10px] font-bold text-green-600/70 uppercase tracking-wider">
                       Pré-visualização
                     </span>
                     <p className="text-gray-800 text-[15px] whitespace-pre-wrap leading-relaxed mt-2">
                       {templateSelecionado.corpo}
                     </p>
                   </div>
                 )}

                 {templateSelecionado?.variaveis.length > 0 && (
                   <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
                     <h3 className="text-sm font-bold text-orange-800 mb-4">4. Preencha as Variáveis do Texto</h3>
                     {templateSelecionado.variaveis.map((variavel: string) => (
                       <div key={variavel} className="flex items-center justify-between mb-3 bg-white p-3 rounded-lg border shadow-sm">
                         <span className="text-sm font-bold text-gray-700">{variavel}</span>
                         <select className="w-1/2 p-2 border-gray-200 rounded-md text-sm outline-none focus:border-blue-500" onChange={(e) => atualizarMapeamento(variavel, e.target.value)}>
                           <option value="">Buscar de qual coluna?</option>
                           {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                         </select>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             )}

             {colunasExcel.length > 0 && (
               <button onClick={dispararCampanha} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-1">🚀 Iniciar Disparo em Massa</button>
             )}
           </div>
        ) : (
          <div className="flex-1 flex flex-col h-full relative">
            <div className="absolute inset-0 z-0 bg-[url('https://i.pinimg.com/originals/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-center opacity-[0.15]"></div>

            {telefoneAtivo ? (
              <div className="flex-1 flex flex-col z-10 w-full h-full bg-white/40 backdrop-blur-sm">
                <div className="h-16 bg-white flex items-center px-6 shadow-sm sticky top-0 z-20">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                    <span className="text-gray-500 font-bold">{telefoneAtivo.substring(0, 2)}</span>
                  </div>
                  <h2 className="font-bold text-gray-800 text-lg">{telefoneAtivo}</h2>
                </div>
                
                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-3">
                  {mensagensDoContato.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.direcao === 'enviada' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-lg shadow-sm max-w-[80%] relative ${
                        msg.direcao === 'enviada' ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none border border-gray-100'
                      }`}>
                        
                        {renderizarBolhaMensagem(msg.texto_mensagem)}
                        
                        <div className="flex justify-end items-center gap-1 mt-1">
                          <span className="text-[10px] text-gray-500">
                            {new Date(msg.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
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

                <div className="p-4 bg-[#f0f2f5] border-t sticky bottom-0">
                  <input 
                    type="text" 
                    placeholder={enviandoMensagem ? "Enviando..." : "Digite uma mensagem..."} 
                    className="w-full py-3 px-5 rounded-full bg-white border-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-700"
                    value={mensagemDigitada}
                    onChange={(e) => setMensagemDigitada(e.target.value)}
                    onKeyDown={enviarMensagemManual}
                    disabled={enviandoMensagem}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center z-10 w-full h-full bg-white/30 backdrop-blur-[2px]">
                <div className="bg-white py-2 px-4 rounded-full shadow-sm text-sm text-gray-500 font-medium">
                  Selecione um contato na barra lateral
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;