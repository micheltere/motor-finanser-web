import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import * as xlsx from 'xlsx';
import { supabase } from './supabase';
import Login from './login';
import { 
  Send, 
  Lock, 
  ArrowLeft, 
  Paperclip, 
  Search, 
  Trash2, 
  OctagonX, 
  DollarSign, 
  Megaphone 
} from 'lucide-react';

// Mapa central que vincula cada Setor à sua Tabela Física e à Categoria de Template da Meta
const CONFIG_SETORES: Record<string, {
  nome: string;
  tabelaMensagens: string;
  categoriaPadrao: string;
}> = {
  cobranca: {
    nome: 'Cobrança',
    tabelaMensagens: 'mensagens',
    categoriaPadrao: 'UTILITY', // Só exibe modelos de Utilidade
  },
  vendas: {
    nome: 'Vendas',
    tabelaMensagens: 'mensagens_vendas',
    categoriaPadrao: 'MARKETING', // Só exibe modelos de Marketing
  },
  // Caso venha a criar um setor para Autenticação/Outros no futuro, basta adicionar aqui:
  // autenticacao: {
  //   nome: 'Autenticação',
  //   tabelaMensagens: 'mensagens_auth',
  //   categoriaPadrao: 'AUTHENTICATION',
  // }
};

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

  // Estados de Navegação e Isolamento por Setor
  const [setorAtivo, setSetorAtivo] = useState<'cobranca' | 'vendas'>('cobranca');
  const [abaAtiva, setAbaAtiva] = useState<'disparo' | 'chat'>('chat');
  const [categoriaTemplateAtiva, setCategoriaTemplateAtiva] = useState<string>('UTILITY');

  const tabelaAtiva = CONFIG_SETORES[setorAtivo].tabelaMensagens;

  // Estados do Chat
  const [conversas, setConversas] = useState<any[]>([]);
  const [telefoneAtivo, setTelefoneAtivo] = useState<string | null>(null);
  const [mensagemDigitada, setMensagemDigitada] = useState('');
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');

  // Estados da Planilha e Disparos
  const [colunasExcel, setColunasExcel] = useState<string[]>([]);
  const [dadosPlanilha, setDadosPlanilha] = useState<any[]>([]);
  const [templatesMeta, setTemplatesMeta] = useState<any[]>([{ id: 'selecione', nome: '🔄 Carregando...', variaveis: [] }]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [colunaTelefoneSelecionada, setColunaTelefoneSelecionada] = useState<string>('');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [statusDisparo, setStatusDisparo] = useState('');

  // Estados de Anexo e Notificação
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const ultimaMsgRef = useRef<string | null>(null);

  // Sincroniza a categoria de templates sempre que trocar de Setor na barra lateral
  useEffect(() => {
    const novaCategoria = CONFIG_SETORES[setorAtivo].categoriaPadrao;
    setCategoriaTemplateAtiva(novaCategoria);
    setTemplateSelecionado(null);
    setMapeamento({});
    setStatusDisparo('');
  }, [setorAtivo]);

  // Permissão de Notificação do Navegador
  useEffect(() => {
    if (!autenticado) return;
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, [autenticado]);

  const dispararAlerta = (msg: any) => {
    try {
      const audio = new Audio('/notificacao.mp3');
      audio.play().catch(() => {});

      if (Notification.permission === 'granted') {
        const resumo = msg.texto_mensagem.replace(/\[.*?\]/g, '📎 Mídia/Anexo');
        new Notification(`[${CONFIG_SETORES[setorAtivo].nome}] Nova mensagem de ${msg.telefone_cliente}`, {
          body: resumo,
          icon: '/favicon.ico'
        });
      }
    } catch (err) {
      console.error('Erro na notificação:', err);
    }
  };

  const marcarComoLidoNoBanco = async (telefone: string) => {
    try {
      await fetch('https://motor-finandesk-xlj9.onrender.com/api/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telefone, setor: setorAtivo })
      });
    } catch (error) {
      console.error("Erro ao enviar comando de leitura para o motor", error);
    }
  };

  // Busca os Templates da Meta uma única vez ao carregar o painel
  useEffect(() => {
    if (!autenticado) return;
    const buscarTemplates = async () => {
      try {
        const urlMotor = 'https://motor-finandesk-xlj9.onrender.com/api/templates';
        const res = await fetch(urlMotor);
        if (res.ok) {
          const templates = await res.json();
          const templatesComDefault = [{ id: 'selecione', nome: '-- Escolha um Template --', variaveis: [] }, ...templates];
          setTemplatesMeta(templatesComDefault);
        }
      } catch (error) {
        setTemplatesMeta([{ id: 'selecione', nome: '❌ Motor Offline.', variaveis: [] }]);
      }
    };
    buscarTemplates();
  }, [autenticado]);

  // Busca as Mensagens da Tabela Física Ativa ('mensagens' ou 'mensagens_vendas')
  useEffect(() => {
    if (!autenticado) return;

    const buscarMensagens = async () => {
      const { data, error } = await supabase
        .from(tabelaAtiva)
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(5000);

      if (!error && data) {
        if (telefoneAtivo) {
          const naoLidasAtivas = data.filter(m =>
            m.telefone_cliente === telefoneAtivo &&
            m.direcao === 'recebida' &&
            m.status !== 'read'
          );

          if (naoLidasAtivas.length > 0) {
            marcarComoLidoNoBanco(telefoneAtivo);
            naoLidasAtivas.forEach(m => m.status = 'read');
          }
        }

        setConversas(data);

        const msgsRecebidas = data.filter(m => m.direcao === 'recebida' && m.status !== 'read');
        if (msgsRecebidas.length > 0) {
          const idMaisRecente = msgsRecebidas[0].id;
          if (ultimaMsgRef.current && ultimaMsgRef.current !== idMaisRecente) {
            if (msgsRecebidas[0].telefone_cliente !== telefoneAtivo) {
              dispararAlerta(msgsRecebidas[0]);
            }
          }
          ultimaMsgRef.current = idMaisRecente;
        }
      }
    };

    buscarMensagens();

    const intervalo = setInterval(buscarMensagens, 5000);
    return () => clearInterval(intervalo);
  }, [autenticado, telefoneAtivo, tabelaAtiva]);

  if (!autenticado) {
    return <Login onLogin={fazerLogin} />;
  }

  const abrirContato = (telefone: string) => {
    setTelefoneAtivo(telefone);
    setAbaAtiva('chat'); // Se estiver na tela de disparo, volta para a conversa na área de trabalho

    const naoLidas = conversas.filter(m => m.telefone_cliente === telefone && m.direcao === 'recebida' && m.status !== 'read');

    if (naoLidas.length > 0) {
      setConversas(prev => prev.map(m =>
        (m.telefone_cliente === telefone && m.direcao === 'recebida') ? { ...m, status: 'read' } : m
      ));
      marcarComoLidoNoBanco(telefone);
    }
  };

  const lidarComArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setStatusDisparo('Carregando planilha...');
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const arrayBuffer = e.target?.result;
      const workbook = xlsx.read(arrayBuffer, { type: 'array' });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const dadosBrutos = xlsx.utils.sheet_to_json(aba, { raw: true });

      const dadosFormatados = dadosBrutos.map((linha: any) => linha);

      if (dadosFormatados.length > 0) {
        setColunasExcel(Object.keys(dadosFormatados[0] as object));
        setDadosPlanilha(dadosFormatados);
        setStatusDisparo(`✅ Planilha lida! ${dadosFormatados.length} registros prontos para ${CONFIG_SETORES[setorAtivo].nome}.`);
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

    const confirmarEnvio = window.confirm(
      `[SETOR: ${CONFIG_SETORES[setorAtivo].nome.toUpperCase()}]\n\nVocê está prestes a enviar o template "${templateSelecionado.nome}" para ${dadosPlanilha.length} contatos.\n\nConfirma que a mensagem e as variáveis estão corretas?`
    );
    if (!confirmarEnvio) return;

    setStatusDisparo('⏳ Empacotando dados e enviando...');

    const pacoteMensagens = dadosPlanilha.map((linha, index) => {
      const variaveisDinamicas = (templateSelecionado.variaveis || []).map((varName: string) => {
        const colunaMapeada = mapeamento[varName];
        const nomeLimpo = varName.replace(/[{}]/g, '').trim();
        if (!colunaMapeada) return { name: nomeLimpo, text: '' };

        const dadoBruto = linha[colunaMapeada];
        let valorTratado = '';

        if (typeof dadoBruto === 'number' && dadoBruto > 20000) {
          const dataExcel = new Date(Math.round((dadoBruto - 25569) * 86400 * 1000));
          const dia = String(dataExcel.getUTCDate()).padStart(2, '0');
          const mes = String(dataExcel.getUTCMonth() + 1).padStart(2, '0');
          const ano = dataExcel.getUTCFullYear();
          valorTratado = `${dia}/${mes}/${ano}`;
        }
        else if (dadoBruto instanceof Date) {
          const dia = String(dadoBruto.getUTCDate()).padStart(2, '0');
          const mes = String(dadoBruto.getUTCMonth() + 1).padStart(2, '0');
          const ano = dadoBruto.getUTCFullYear();
          valorTratado = `${dia}/${mes}/${ano}`;
        }
        else {
          let valorTexto = String(dadoBruto || '').trim();
          if (valorTexto.includes('/')) {
            const partes = valorTexto.split('/');
            if (partes.length === 3) {
              let ano = partes[2];
              if (ano.length === 2) ano = `20${ano}`;
              valorTratado = `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${ano}`;
            } else if (partes.length === 2) {
              valorTratado = `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${new Date().getFullYear()}`;
            } else {
              valorTratado = valorTexto;
            }
          } else {
            valorTratado = valorTexto;
          }
        }

        return { name: nomeLimpo, text: valorTratado };
      });

      let telefoneLimpo = String(linha[colunaTelefoneSelecionada] || '').replace(/\D/g, '');
      if (telefoneLimpo && !telefoneLimpo.startsWith('55')) telefoneLimpo = `55${telefoneLimpo}`;

      return {
        id: `msg_${Date.now()}_${index}`,
        phone: telefoneLimpo,
        templateName: templateSelecionado.id,
        variables: variaveisDinamicas,
        setor: setorAtivo
      };
    }).filter(msg => msg.phone !== '');

    try {
      const urlMotor = 'https://motor-finandesk-xlj9.onrender.com/api/send-bulk';
      const resposta = await fetch(urlMotor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: pacoteMensagens, setor: setorAtivo })
      });

      if (resposta.ok) {
        setStatusDisparo(`🚀 SUCESSO! ${pacoteMensagens.length} mensagens enviadas para a fila de ${CONFIG_SETORES[setorAtivo].nome}!`);
        const { data } = await supabase.from(tabelaAtiva).select('*').order('criado_em', { ascending: false }).limit(5000);
        if (data) setConversas(data);
      } else {
        setStatusDisparo('❌ Erro no envio.');
      }
    } catch (erro) {
      setStatusDisparo('❌ Motor offline.');
    }
  };

  const cancelarDisparoEmAndamento = async () => {
    const confirmar = window.confirm(
      '🛑 ATENÇÃO: Deseja parar imediatamente a fila de disparos no servidor?\n\nAs mensagens que ainda estão aguardando na fila NÃO serão enviadas.'
    );
    if (!confirmar) return;

    const apagarDoPainel = window.confirm(
      'Deseja também APAGAR do histórico do Chat as mensagens que já saíram neste disparo errado?'
    );

    try {
      const urlMotor = 'https://motor-finandesk-xlj9.onrender.com/api/cancel-bulk';
      const resposta = await fetch(urlMotor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apagarDoChat: apagarDoPainel,
          templateName: templateSelecionado?.id !== 'selecione' ? templateSelecionado?.id : null,
          setor: setorAtivo
        })
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        setStatusDisparo(`🛑 Fila interrompida! ${dados.canceladas} envios pendentes foram cancelados.`);
        const { data } = await supabase.from(tabelaAtiva).select('*').order('criado_em', { ascending: false }).limit(5000);
        if (data) setConversas(data);
      } else {
        alert('❌ Erro ao tentar cancelar a fila.');
      }
    } catch (erro) {
      alert('❌ Erro de conexão com o Motor.');
    }
  };

  const excluirMensagem = async (idMensagem: number | string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta mensagem do painel?')) return;

    try {
      const urlMotor = `https://motor-finandesk-xlj9.onrender.com/api/messages/${idMensagem}?setor=${setorAtivo}`;
      const resposta = await fetch(urlMotor, { method: 'DELETE' });

      if (resposta.ok) {
        setConversas(prev => prev.filter(msg => msg.id !== idMensagem));
      } else {
        alert('❌ Não foi possível excluir a mensagem.');
      }
    } catch (err) {
      alert('❌ Erro de conexão com o Motor.');
    }
  };

  const excluirConversaInteira = async (telefone: string) => {
    if (!window.confirm(`Tem certeza que deseja apagar TODO o histórico de mensagens do número ${telefone} no setor de ${CONFIG_SETORES[setorAtivo].nome}?`)) return;

    try {
      const urlMotor = `https://motor-finandesk-xlj9.onrender.com/api/conversations/${telefone}?setor=${setorAtivo}`;
      const resposta = await fetch(urlMotor, { method: 'DELETE' });

      if (resposta.ok) {
        setConversas(prev => prev.filter(msg => msg.telefone_cliente !== telefone));
        setTelefoneAtivo(null);
      } else {
        alert('❌ Não foi possível excluir a conversa.');
      }
    } catch (err) {
      alert('❌ Erro de conexão com o Motor.');
    }
  };

  const dispararMensagemManual = async () => {
    if (mensagemDigitada.trim() !== '' && telefoneAtivo) {
      setEnviandoMensagem(true);
      try {
        const urlMotor = 'https://motor-finandesk-xlj9.onrender.com/api/send-message';
        const resposta = await fetch(urlMotor, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: telefoneAtivo, text: mensagemDigitada, setor: setorAtivo })
        });

        if (resposta.ok) {
          setMensagemDigitada('');
          const { data } = await supabase.from(tabelaAtiva).select('*').order('criado_em', { ascending: false }).limit(5000);
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

  const lidarComBotaoAnexo = () => {
    fileInputRef.current?.click();
  };

  const lidarComEnvioAnexo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo || !telefoneAtivo) return;

    if (arquivo.size > 15 * 1024 * 1024) {
      alert('⚠️ O arquivo é muito grande. O limite máximo é de 15MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setEnviandoMidia(true);

    const leitor = new FileReader();
    leitor.readAsDataURL(arquivo);
    leitor.onload = async () => {
      const base64 = leitor.result as string;

      try {
        const urlMotor = 'https://motor-finandesk-xlj9.onrender.com/api/send-media';
        const resposta = await fetch(urlMotor, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: telefoneAtivo,
            base64: base64,
            fileName: arquivo.name,
            mimeType: arquivo.type,
            setor: setorAtivo
          })
        });

        if (resposta.ok) {
          const { data } = await supabase.from(tabelaAtiva).select('*').order('criado_em', { ascending: false }).limit(5000);
          if (data) setConversas(data);
        } else {
          alert('❌ A Meta bloqueou o envio deste arquivo ou o formato não é suportado.');
        }
      } catch (err) {
        alert('❌ Erro de conexão com o Motor ao enviar arquivo.');
      } finally {
        setEnviandoMidia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      dispararMensagemManual();
    }
  };

  // Filtragem de Contatos do Setor Ativo
  const contatosUnicos = conversas.reduce((acc, msg) => {
    if (!acc[msg.telefone_cliente]) acc[msg.telefone_cliente] = msg;
    return acc;
  }, {});
  const listaContatos: any[] = Object.values(contatosUnicos);

  const listaContatosFiltrados = listaContatos.filter((contato) => {
    if (termoBusca.trim() === '') return true;

    const termo = termoBusca.toLowerCase();
    if (contato.telefone_cliente.toLowerCase().includes(termo)) return true;

    const msgsContato = conversas.filter(m => m.telefone_cliente === contato.telefone_cliente);
    const temMensagemComTermo = msgsContato.some(m =>
      m.texto_mensagem && m.texto_mensagem.toLowerCase().includes(termo)
    );

    return temMensagemComTermo;
  });

  const calcularNaoLidas = (telefone: string) => {
    if (telefoneAtivo === telefone && abaAtiva === 'chat') return 0;
    const msgsContato = conversas.filter(m => m.telefone_cliente === telefone);
    const pendentes = msgsContato.filter(m => m.direcao === 'recebida' && m.status !== 'read');
    return pendentes.length;
  };

  const totalNaoRespondidas = listaContatos.reduce((total, c) => {
    return total + (calcularNaoLidas(c.telefone_cliente) > 0 ? 1 : 0);
  }, 0);

  const mensagensDoContato = conversas
    .filter(msg => msg.telefone_cliente === telefoneAtivo)
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());

  // Filtragem Automática de Templates por Categoria (UTILITY, MARKETING e Outras)
  const templatesFiltrados = templatesMeta.filter((tpl) => {
    if (tpl.id === 'selecione') return false;
    // Se o backend antigo ainda não enviou a propriedade categoria, exibe todos para não travar
    if (!tpl.categoria) return true;
    return tpl.categoria.toUpperCase() === categoriaTemplateAtiva;
  });

  const categoriasDisponiveisNaMeta = Array.from(
    new Set(templatesMeta.filter(t => t.id !== 'selecione' && t.categoria).map(t => t.categoria.toUpperCase()))
  );
  const outrasCategorias = categoriasDisponiveisNaMeta.filter(
    cat => cat !== 'UTILITY' && cat !== 'MARKETING'
  );

  const formatarResumoSidebar = (texto: string) => {
    if (!texto) return '';
    if (texto.startsWith('[IMAGEM|')) return '📷 Imagem';
    if (texto.startsWith('[DOCUMENTO|')) return '📄 Documento';
    if (texto.startsWith('[AUDIO|')) return '🎵 Áudio';
    if (texto.startsWith('[Reação:')) return '👍 Reagiu à mensagem';

    if (texto.startsWith('[Template: ')) {
      const nomeTemplate = texto.replace('[Template: ', '').replace(/\]$/, '').split(' | ')[0].trim();
      return `📢 Disparo (${nomeTemplate})`;
    }

    return texto;
  };

  const renderizarBolhaMensagem = (texto: string) => {
    if (!texto) return null;

    if (texto.startsWith('[IMAGEM|')) {
      const partes = texto.split('|');
      const mediaId = partes[1];
      const legenda = partes[2] && partes[2] !== ']' ? partes[2].replace(']', '') : '';
      const urlMidia = `https://motor-finandesk-xlj9.onrender.com/api/media/${mediaId}`;

      return (
        <div className="flex flex-col gap-2">
          <img src={urlMidia} alt="Mídia recebida" className="max-w-[280px] rounded-lg border border-gray-200 shadow-sm bg-gray-50" loading="lazy" />
          {legenda && <span className="text-sm text-gray-700">{legenda}</span>}
        </div>
      );
    }

    if (texto.startsWith('[DOCUMENTO|')) {
      const partes = texto.split('|');
      const mediaId = partes[1];
      const nomeArquivo = partes[2] ? partes[2].replace(']', '') : 'Documento';
      const urlDoc = `https://motor-finandesk-xlj9.onrender.com/api/media/${mediaId}`;

      return (
        <a href={urlDoc} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white/60 border border-gray-200 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-white transition-colors">
          <span className="text-xl">📄</span>
          <span className="text-sm font-semibold truncate max-w-[200px]">{nomeArquivo}</span>
        </a>
      );
    }

    if (texto.startsWith('[AUDIO|')) {
      const mediaId = texto.replace('[AUDIO|', '').replace(']', '').trim();
      const urlAudio = `https://motor-finandesk-xlj9.onrender.com/api/media/${mediaId}`;

      return (
        <div className="flex items-center gap-2 min-w-[200px] md:min-w-[250px] py-1">
          <audio controls className="w-full h-10 rounded-full bg-gray-50">
            <source src={urlAudio} />
            Seu navegador não suporta áudio.
          </audio>
        </div>
      );
    }

    if (texto.startsWith('[Reação:')) {
      const emoji = texto.replace('[Reação: ', '').replace(']', '').trim();
      return <p className="text-gray-800 text-[24px]">{emoji}</p>;
    }

    if (texto.startsWith('[Template: ')) {
      const conteudoStr = texto.replace('[Template: ', '').replace(/\]$/, '').trim();
      const partes = conteudoStr.split(' | ');

      const nomeTemplate = partes[0];
      const variaveisSalvas = partes.slice(1);

      const templateEncontrado = templatesMeta.find(t => t.id === nomeTemplate);

      if (templateEncontrado && templateEncontrado.corpo) {
        let corpoFormatado = templateEncontrado.corpo;

        if (templateEncontrado.variaveis && templateEncontrado.variaveis.length > 0) {
          templateEncontrado.variaveis.forEach((nomeTagExata: string, index: number) => {
            const valorDaVariavel = variaveisSalvas[index] !== undefined ? variaveisSalvas[index] : '';
            corpoFormatado = corpoFormatado.split(nomeTagExata).join(valorDaVariavel);
          });
        }

        return (
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-green-700/60 uppercase tracking-wider mb-2 border-b border-green-700/10 pb-1">
              Campanha: {templateEncontrado.nome}
            </span>
            <p className="text-gray-800 text-[15px] whitespace-pre-wrap leading-relaxed">
              {corpoFormatado}
            </p>
          </div>
        );
      }

      return <p className="text-gray-800 text-[15px] italic text-gray-600">📢 Disparo: {nomeTemplate}</p>;
    }

    return <p className="text-gray-800 text-[15px] whitespace-pre-wrap">{texto}</p>;
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 font-sans text-gray-800 overflow-hidden">
      
      {/* 1. BARRA LATERAL ESCURA: Seções de Cobrança e Vendas */}
      <div className={`bg-[#0b141a] flex-col items-center py-6 justify-between z-20 shadow-xl transition-all ${
        telefoneAtivo && abaAtiva === 'chat' ? 'hidden md:flex w-[76px]' : 'flex w-[76px]'
      }`}>
        <div className="flex flex-col gap-5 w-full px-2.5">
          {/* Botão Setor: Cobrança */}
          <button 
            onClick={() => { 
              if (setorAtivo !== 'cobranca') setConversas([]);
              setSetorAtivo('cobranca'); 
              setTelefoneAtivo(null); 
              setAbaAtiva('chat'); 
            }}
            className={`w-full py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative ${
              setorAtivo === 'cobranca' 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Setor de Cobrança"
          >
            <DollarSign size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Cobrança</span>
            {setorAtivo === 'cobranca' && totalNaoRespondidas > 0 && (
              <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0b141a]">
                {totalNaoRespondidas}
              </span>
            )}
          </button>

          {/* Botão Setor: Vendas / Marketing */}
          <button 
            onClick={() => { 
              if (setorAtivo !== 'vendas') setConversas([]);
              setSetorAtivo('vendas'); 
              setTelefoneAtivo(null); 
              setAbaAtiva('chat'); 
            }}
            className={`w-full py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative ${
              setorAtivo === 'vendas' 
                ? 'bg-emerald-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title="Setor de Vendas e Marketing"
          >
            <Megaphone size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Vendas</span>
            {setorAtivo === 'vendas' && totalNaoRespondidas > 0 && (
              <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0b141a]">
                {totalNaoRespondidas}
              </span>
            )}
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

      {/* 2. COLUNA DO CHAT: Sempre exibe os contatos do Setor + Botão no topo para abrir a Página de Disparos */}
      <div className={`bg-white border-r border-gray-200 flex-col z-10 shadow-sm ${
        abaAtiva === 'disparo' ? 'hidden md:flex md:w-[340px]' : (telefoneAtivo && abaAtiva === 'chat' ? 'hidden md:flex md:w-[340px]' : 'flex flex-1 md:w-[340px] md:flex-none')
      }`}>
        {/* Topo da Barra do Chat com Título do Setor e Botão para abrir Página de Disparos */}
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3 flex-shrink-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg text-[#111b21]">
              {setorAtivo === 'cobranca' ? 'Atendimentos Cobrança' : 'Atendimentos Vendas'}
            </h2>
            {totalNaoRespondidas > 0 ? (
              <span className="text-xs bg-green-100 text-green-800 font-bold px-2.5 py-1 rounded-full">
                {totalNaoRespondidas} pendentes
              </span>
            ) : (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                setorAtivo === 'cobranca' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {CONFIG_SETORES[setorAtivo].nome}
              </span>
            )}
          </div>

          {/* BOTÃO NO TOPO DA BARRA DO CHAT PARA ABRIR PÁGINA DE DISPAROS NA ÁREA DE TRABALHO */}
          <button
            onClick={() => {
              setAbaAtiva('disparo');
              setTelefoneAtivo(null);
            }}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              abaAtiva === 'disparo'
                ? (setorAtivo === 'cobranca' ? 'bg-blue-600 text-white shadow-md' : 'bg-emerald-600 text-white shadow-md')
                : (setorAtivo === 'cobranca' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200')
            }`}
          >
            <Send size={16} />
            {setorAtivo === 'cobranca' ? 'Página de Disparos (Cobrança)' : 'Página de Disparos (Vendas)'}
          </button>
        </div>

        {/* Barra de Pesquisa de Contatos */}
        <div className="p-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder={`Buscar em ${CONFIG_SETORES[setorAtivo].nome}...`}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
            />
          </div>
        </div>
        
        {/* Lista de Conversas do Setor Ativo */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-2 bg-[#f0f2f5] text-[11px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 z-10">
            {termoBusca ? 'Resultados da Busca' : `Conversas de ${CONFIG_SETORES[setorAtivo].nome}`}
          </div>

          {listaContatosFiltrados.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              Nenhuma conversa registrada em {CONFIG_SETORES[setorAtivo].nome}.
            </div>
          ) : (
            listaContatosFiltrados.map((contato, index) => {
              const numNaoLidas = calcularNaoLidas(contato.telefone_cliente);
              return (
                <div 
                  key={index} 
                  onClick={() => abrirContato(contato.telefone_cliente)}
                  className={`p-4 border-b border-gray-50 cursor-pointer flex items-center justify-between transition-colors ${
                    telefoneAtivo === contato.telefone_cliente && abaAtiva === 'chat' 
                      ? 'bg-[#f0f2f5]' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-semibold text-gray-800 text-sm truncate">{contato.telefone_cliente}</h3>
                    <p className="text-xs text-gray-500 truncate mt-1">
                      {formatarResumoSidebar(contato.texto_mensagem)}
                    </p>
                  </div>

                  {numNaoLidas > 0 && (
                    <span className="bg-green-500 text-white font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                      {numNaoLidas}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. ÁREA DE TRABALHO PRINCIPAL (Disparos do Setor OU Chat Aberto) */}
      <div className={`bg-gray-50 relative overflow-hidden flex-1 ${
        abaAtiva === 'chat' && !telefoneAtivo ? 'hidden md:flex flex-col' : 'flex flex-col'
      }`}>
        {abaAtiva === 'disparo' ? (
           <div className="p-4 md:p-10 w-full max-w-4xl mx-auto overflow-y-auto h-full">
             <div className="flex items-center justify-between mb-6 md:mb-8">
               <div>
                 <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                   setorAtivo === 'cobranca' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                 }`}>
                   Ambiente Isolado: {CONFIG_SETORES[setorAtivo].nome}
                 </span>
                 <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mt-2">
                   {setorAtivo === 'cobranca' ? 'Disparo de Cobrança' : 'Disparo de Marketing e Vendas'}
                 </h1>
               </div>

               {/* Botão Voltar no Celular */}
               <button
                 onClick={() => setAbaAtiva('chat')}
                 className="md:hidden px-3 py-2 bg-gray-200 rounded-lg text-xs font-bold text-gray-700"
               >
                 Voltar ao Chat
               </button>
             </div>
             
             <div className="bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-gray-100 mb-6">
               <label className="block text-sm font-bold text-gray-700 mb-4">
                 1. Importar Planilha ({CONFIG_SETORES[setorAtivo].nome})
               </label>
               <input 
                 type="file" 
                 accept=".csv, .xlsx, .xls" 
                 onChange={lidarComArquivo} 
                 className={`w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold transition-colors ${
                   setorAtivo === 'cobranca'
                     ? 'file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100'
                     : 'file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100'
                 }`} 
               />
               {statusDisparo && (
                 <p className="mt-4 text-sm font-medium text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                   {statusDisparo}
                 </p>
               )}
             </div>

             {colunasExcel.length > 0 && (
               <div className="bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-gray-100 mb-6 animate-fade-in">
                 <div className="bg-green-50 p-4 md:p-5 rounded-xl border border-green-100 mb-6">
                   <h3 className="text-sm font-bold text-green-800 mb-3">2. Qual coluna tem os números de WhatsApp?</h3>
                   <select 
                     value={colunaTelefoneSelecionada}
                     className="w-full p-3 rounded-lg border-green-200 text-gray-700 focus:ring-green-500 focus:border-green-500 outline-none" 
                     onChange={(e) => setColunaTelefoneSelecionada(e.target.value)}
                   >
                     <option value="">Selecione a coluna...</option>
                     {colunasExcel.map(col => <option key={col} value={col}>{col}</option>)}
                   </select>
                 </div>
                 
                 {/* 3. Seletor de Templates com Filtro Automático por Categoria (UTILITY / MARKETING / Outras) */}
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                   <h3 className="text-sm font-bold text-gray-700">3. Escolha a Mensagem (Template)</h3>

                   <div className="flex items-center gap-2 flex-wrap">
                     <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${
                       categoriaTemplateAtiva === 'UTILITY' 
                         ? 'bg-blue-100 text-blue-700' 
                         : categoriaTemplateAtiva === 'MARKETING'
                         ? 'bg-emerald-100 text-emerald-700'
                         : 'bg-purple-100 text-purple-700'
                     }`}>
                       Categoria: {categoriaTemplateAtiva} ({templatesFiltrados.length})
                     </span>

                     {/* Caso existam outras categorias na Meta (ex: AUTHENTICATION), exibe botão para alternar */}
                     {outrasCategorias.map((cat) => (
                       <button
                         key={cat}
                         type="button"
                         onClick={() => {
                           setCategoriaTemplateAtiva(
                             categoriaTemplateAtiva === cat ? CONFIG_SETORES[setorAtivo].categoriaPadrao : cat
                           );
                           setTemplateSelecionado(null);
                         }}
                         className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase transition-all ${
                           categoriaTemplateAtiva === cat
                             ? 'bg-purple-600 text-white shadow-sm'
                             : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                         }`}
                       >
                         {categoriaTemplateAtiva === cat 
                           ? `Voltar para ${CONFIG_SETORES[setorAtivo].categoriaPadrao}` 
                           : `+ Ver ${cat}`}
                       </button>
                     ))}
                   </div>
                 </div>

                 <select 
                   value={templateSelecionado?.id || 'selecione'}
                   className="w-full p-3 rounded-lg bg-gray-50 border border-gray-200 mb-6 outline-none focus:ring-blue-500" 
                   onChange={(e) => {
                     const selecionado = templatesFiltrados.find(t => t.id === e.target.value);
                     setTemplateSelecionado(selecionado || null);
                     setMapeamento({});
                   }}
                 >
                   <option value="selecione">-- Escolha um Template ({categoriaTemplateAtiva}) --</option>
                   {templatesFiltrados.map(tpl => (
                     <option key={tpl.id} value={tpl.id}>{tpl.nome}</option>
                   ))}
                 </select>

                 {templateSelecionado && templateSelecionado.id !== 'selecione' && templateSelecionado.corpo && (
                   <div className="bg-[#dcf8c6] p-4 md:p-5 rounded-xl border border-green-200/50 mb-6 relative shadow-sm w-full md:max-w-[85%]">
                     <span className="absolute top-2 right-3 text-[10px] font-bold text-green-600/70 uppercase tracking-wider">
                       Pré-visualização
                     </span>
                     <p className="text-gray-800 text-[14px] md:text-[15px] whitespace-pre-wrap leading-relaxed mt-2">
                       {templateSelecionado.corpo}
                     </p>
                   </div>
                 )}

                 {templateSelecionado?.variaveis?.length > 0 && (
                   <div className="bg-orange-50 p-4 md:p-6 rounded-xl border border-orange-100">
                     <h3 className="text-sm font-bold text-orange-800 mb-4">4. Preencha as Variáveis do Texto</h3>
                     {templateSelecionado.variaveis.map((variavel: string) => (
                       <div key={variavel} className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 bg-white p-3 rounded-lg border shadow-sm">
                         <span className="text-sm font-bold text-gray-700">{variavel}</span>
                         <select 
                           value={mapeamento[variavel] || ''}
                           className="w-full md:w-1/2 p-2 border-gray-200 rounded-md text-sm outline-none focus:border-blue-500" 
                           onChange={(e) => atualizarMapeamento(variavel, e.target.value)}
                         >
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
               <div className="flex flex-col md:flex-row gap-4 mb-8">
                 <button 
                   onClick={dispararCampanha} 
                   className={`flex-1 text-white px-8 py-5 rounded-2xl font-bold text-lg shadow-lg transition-all hover:-translate-y-1 ${
                     setorAtivo === 'cobranca'
                       ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                       : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
                   }`}
                 >
                   🚀 Iniciar Disparo de {CONFIG_SETORES[setorAtivo].nome}
                 </button>

                 <button 
                   onClick={cancelarDisparoEmAndamento} 
                   className="bg-red-600 hover:bg-red-700 text-white px-6 py-5 rounded-2xl font-bold text-base shadow-lg shadow-red-500/30 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
                   title="Para a fila imediatamente e limpa disparos feitos por engano"
                 >
                   <OctagonX size={22} />
                   Cancelar / Limpar Disparo
                 </button>
               </div>
             )}
           </div>
        ) : (
          <div className="flex-1 flex flex-col h-full relative bg-[#efeae2]">

            {telefoneAtivo ? (
              <div className="flex-1 flex flex-col z-10 w-full h-full bg-white/40 backdrop-blur-sm">
                
                {/* CABEÇALHO DO CHAT COM ETIQUETA DO SETOR E BOTÃO DE APAGAR CONVERSA */}
                <div className="h-16 bg-white flex items-center justify-between px-4 md:px-6 shadow-sm sticky top-0 z-20 flex-shrink-0">
                  <div className="flex items-center truncate gap-3">
                    <button 
                      onClick={() => setTelefoneAtivo(null)} 
                      className="md:hidden p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <ArrowLeft size={20} />
                    </button>

                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-500 font-bold">{telefoneAtivo.substring(0, 2)}</span>
                    </div>
                    <div className="truncate">
                      <h2 className="font-bold text-gray-800 text-base md:text-lg truncate leading-tight">{telefoneAtivo}</h2>
                      <span className={`text-[10px] font-bold uppercase ${
                        setorAtivo === 'cobranca' ? 'text-blue-600' : 'text-emerald-600'
                      }`}>
                        Setor: {CONFIG_SETORES[setorAtivo].nome}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => excluirConversaInteira(telefoneAtivo)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Apagar toda a conversa deste contato"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
                
                {/* LISTA DE MENSAGENS COM LIXEIRA INDIVIDUAL EM CADA BOLHA */}
                <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col gap-3">
                  {mensagensDoContato.map((msg, idx) => (
                    <div key={idx} className={`flex group ${msg.direcao === 'enviada' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-lg shadow-sm max-w-[90%] md:max-w-[80%] relative ${
                        msg.direcao === 'enviada' ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none border border-gray-100'
                      }`}>
                        
                        <button
                          onClick={() => excluirMensagem(msg.id)}
                          className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 bg-white text-gray-400 hover:text-red-600 p-1.5 rounded-full shadow-md border border-gray-100 transition-all z-10"
                          title="Excluir esta mensagem do painel"
                        >
                          <Trash2 size={14} />
                        </button>

                        {renderizarBolhaMensagem(msg.texto_mensagem)}
                        
                        <div className="flex justify-end items-center gap-1 mt-1">
                          <span className="text-[10px] text-gray-500 font-medium">
                            {(() => {
                              const dataMsg = new Date(msg.criado_em);
                              const hoje = new Date();
                              
                              const isHoje = dataMsg.getDate() === hoje.getDate() &&
                                             dataMsg.getMonth() === hoje.getMonth() &&
                                             dataMsg.getFullYear() === hoje.getFullYear();
                                             
                              const hora = dataMsg.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              
                              return isHoje ? hora : `${dataMsg.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit'})} às ${hora}`;
                            })()}
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

                <div className="p-3 md:p-4 bg-[#f0f2f5] border-t flex items-center gap-2 flex-shrink-0">
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={lidarComEnvioAnexo} 
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  />
                  
                  <button 
                    onClick={lidarComBotaoAnexo}
                    disabled={enviandoMensagem || enviandoMidia}
                    className="w-12 h-12 flex-shrink-0 bg-white rounded-full flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors shadow-sm disabled:opacity-50"
                    title="Enviar anexo"
                  >
                    <Paperclip size={20} />
                  </button>

                  <input 
                    type="text" 
                    placeholder={enviandoMidia ? "Enviando arquivo..." : (enviandoMensagem ? "Enviando..." : `Responder em ${CONFIG_SETORES[setorAtivo].nome}...`)} 
                    className="flex-1 py-3 px-5 rounded-full bg-white border-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-700 disabled:opacity-70 disabled:bg-gray-100"
                    value={mensagemDigitada}
                    onChange={(e) => setMensagemDigitada(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={enviandoMensagem || enviandoMidia}
                  />
                  
                  {mensagemDigitada.trim() !== '' && (
                    <button 
                      onClick={dispararMensagemManual}
                      disabled={enviandoMensagem || enviandoMidia}
                      className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center text-white transition-colors shadow-sm disabled:opacity-50 ${
                        setorAtivo === 'cobranca' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <Send size={20} className="md:ml-1" />
                    </button>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center z-10 w-full h-full bg-white/30 backdrop-blur-[2px]">
                <div className="bg-white py-2.5 px-5 rounded-full shadow-sm text-sm text-gray-500 font-medium">
                  Selecione um contato de <strong>{CONFIG_SETORES[setorAtivo].nome}</strong> ao lado ou clique em <strong>Página de Disparos</strong>
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