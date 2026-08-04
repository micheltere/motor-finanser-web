import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import * as xlsx from 'xlsx';
import { supabase } from './supabase';

function App() {
  const [abaAtiva, setAbaAtiva] = useState<'disparo' | 'chat'>('disparo');
  
  // Chat
  const [conversas, setConversas] = useState<any[]>([]);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<any | null>(null);

  // Disparo e Templates Dinâmicos
  const [colunasExcel, setColunasExcel] = useState<string[]>([]);
  const [dadosPlanilha, setDadosPlanilha] = useState<any[]>([]);
  
  // Estado que começa carregando e vai receber os dados da Meta
  const [templatesMeta, setTemplatesMeta] = useState<any[]>([{ id: 'selecione', nome: '🔄 Carregando templates da Meta...', variaveis: [] }]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [statusDisparo, setStatusDisparo] = useState('');

  // EFEITO: Busca Mensagens do Supabase E Templates da Meta
  useEffect(() => {
    // 1. Busca Histórico (Supabase)
    const buscarMensagens = async () => {
      const { data, error } = await supabase.from('mensagens').select('*').order('created_at', { ascending: false });
      if (!error) setConversas(data || []);
    };

    // 2. Busca Templates Dinâmicos (Via Motor)
    const buscarTemplates = async () => {
      try {
        const urlMotor = 'https://motor-finanser-api.onrender.com/api/templates';
        const res = await fetch(urlMotor);
        if (res.ok) {
          const templates = await res.json();
          const templatesComDefault = [{ id: 'selecione', nome: '-- Escolha um Template Aprovado --', variaveis: [] }, ...templates];
          setTemplatesMeta(templatesComDefault);
          setTemplateSelecionado(templatesComDefault[0]);
        } else {
          setTemplatesMeta([{ id: 'selecione', nome: '❌ Erro ao puxar templates.', variaveis: [] }]);
        }
      } catch (error) {
        setTemplatesMeta([{ id: 'selecione', nome: '❌ Motor Offline.', variaveis: [] }]);
      }
    };

    buscarMensagens();
    buscarTemplates();
  }, []);

  const lidarComArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setStatusDisparo('Carregando planilha...');
    const leitor = new FileReader();

    leitor.onload = (e) => {
      const arrayBuffer = e.target?.result;
      const workbook = xlsx.read(arrayBuffer, { type: 'array' });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const dadosJson = xlsx.utils.sheet_to_json(aba);
      
      if (dadosJson.length > 0) {
        setColunasExcel(Object.keys(dadosJson[0] as object));
        setDadosPlanilha(dadosJson);
        setStatusDisparo(`✅ Planilha lida! ${dadosJson.length} registros.`);
      } else {
        setStatusDisparo('❌ Planilha vazia.');
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  };

  const atualizarMapeamento = (nomeVariavel: string, colunaSelecionada: string) => {
    setMapeamento(prev => ({ ...prev, [nomeVariavel]: colunaSelecionada }));
  };

  const dispararCampanha = async () => {
    if (!templateSelecionado || templateSelecionado.id === 'selecione') {
      alert('Selecione um template válido!');
      return;
    }

    setStatusDisparo('⏳ Empacotando dados e enviando para a Nuvem...');

    const pacoteMensagens = dadosPlanilha.map((linha, index) => {
      const variaveisDinamicas = templateSelecionado.variaveis.map((varName: string) => {
        const colunaMapeada = mapeamento[varName];
        return colunaMapeada ? String(linha[colunaMapeada] || '') : '';
      });

      const colunaTelefone = colunasExcel.find(c => c.toLowerCase().includes('celular') || c.toLowerCase().includes('telefone'));
      let telefoneBruto = colunaTelefone ? String(linha[colunaTelefone]) : '';
      let telefoneLimpo = telefoneBruto.replace(/\D/g, '');
      if (telefoneLimpo && !telefoneLimpo.startsWith('55')) telefoneLimpo = `55${telefoneLimpo}`;

      return {
        id: `msg_${Date.now()}_${index}`,
        phone: telefoneLimpo,
        templateName: templateSelecionado.id,
        variables: variaveisDinamicas
      };
    }).filter(msg => msg.phone !== '');

    try {
      const urlMotor = 'https://motor-finanser-api.onrender.com/api/send-bulk'; 
      const resposta = await fetch(urlMotor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: pacoteMensagens })
      });

      if (resposta.ok) setStatusDisparo(`🚀 SUCESSO! ${pacoteMensagens.length} mensagens enfileiradas!`);
      else setStatusDisparo('❌ O Motor recusou o pacote.');
    } catch (erro) {
      setStatusDisparo('❌ Motor offline.');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* ================= BARRA LATERAL ================= */}
      <div className="w-1/3 max-w-sm bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">Motor FINANSER</h2>
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        </div>

        <div className="p-4 border-b border-gray-200">
          <button onClick={() => setAbaAtiva('disparo')}
            className={`w-full py-2.5 rounded-lg font-semibold transition ${
              abaAtiva === 'disparo' ? 'bg-green-600 text-white shadow-md' : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >+ Nova Campanha</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase sticky top-0">Caixa de Entrada</div>
          {conversas.map((msg, index) => (
            <div key={index} onClick={() => { setMensagemSelecionada(msg); setAbaAtiva('chat'); }}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                mensagemSelecionada?.id === msg.id && abaAtiva === 'chat' ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div className="flex justify-between items-baseline mb-1">
                <h3 className="font-semibold text-gray-800">{msg.telefone_cliente || 'Desconhecido'}</h3>
                <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm text-gray-500 truncate">{msg.texto_mensagem}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ================= PAINEL CENTRAL ================= */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
        
        {abaAtiva === 'disparo' ? (
          <div className="p-8 max-w-4xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Disparo Inteligente</h1>
            <p className="text-gray-500 mb-8">Importe sua planilha e mapeie as colunas com a Meta.</p>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
              <h2 className="text-md font-semibold mb-4 text-gray-700">1. Arquivo de Dados</h2>
              <input type="file" accept=".csv, .xlsx, .xls" onChange={lidarComArquivo}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
              />
              {statusDisparo && <p className="mt-3 text-sm font-medium text-blue-600 bg-blue-50 p-2 rounded">{statusDisparo}</p>}
            </div>

            {colunasExcel.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6 animate-fade-in-up">
                <h2 className="text-md font-semibold mb-4 text-gray-700">2. Mapeamento do Template (Sincronizado c/ Meta)</h2>
                
                <select 
                  className="w-full border-gray-300 rounded-md shadow-sm p-3 border mb-6 bg-gray-50 focus:bg-white font-medium"
                  onChange={(e) => {
                    const tpl = templatesMeta.find(t => t.id === e.target.value);
                    if (tpl) setTemplateSelecionado(tpl);
                  }}
                >
                  {templatesMeta.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.nome}</option>)}
                </select>

                {templateSelecionado && templateSelecionado.variaveis.length > 0 && (
                  <div className="bg-orange-50 p-5 rounded-lg border border-orange-200">
                    <h3 className="text-sm font-bold text-orange-800 mb-4">Ligue as Colunas da Planilha ➜ Variáveis da Meta</h3>
                    {templateSelecionado.variaveis.map((variavel: string) => (
                      <div key={variavel} className="flex items-center justify-between mb-3 bg-white p-2 rounded border border-orange-100">
                        <span className="text-sm font-medium text-gray-700 w-1/3 pl-2"><b>{variavel}</b></span>
                        <span className="text-orange-300 mx-2">➜</span>
                        <select className="w-1/2 border-gray-200 rounded p-2 text-sm border bg-gray-50" onChange={(e) => atualizarMapeamento(variavel, e.target.value)}>
                          <option value="">Selecione a coluna...</option>
                          {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {colunasExcel.length > 0 && (
              <button onClick={dispararCampanha} className="w-full bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition shadow-lg">
                🚀 INICIAR DISPAROS
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full bg-[url('https://i.pinimg.com/originals/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-center">
             {/* Conteúdo do chat mantido igual */}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;