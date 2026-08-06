import React, { useState } from 'react';

interface LoginProps {
  onLogin: (senhaDigitada: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.trim() === '') return;
    
    // Passa a senha para o App.tsx validar
    onLogin(senha);
    
    // Se o código chegou aqui e a tela não mudou, é porque a senha estava errada
    setErro(true);
    setSenha('');
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-600">FINANSER</h1>
          <p className="mt-2 text-gray-500">Acesso Restrito ao Sistema</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha Mestre
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro(false); // Limpa o erro quando o usuário volta a digitar
              }}
              className={`block w-full rounded-md border p-3 shadow-sm focus:outline-none focus:ring-2 transition-all ${
                erro 
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                  : 'border-gray-300 focus:border-green-500 focus:ring-green-500'
              }`}
              placeholder="Digite sua senha..."
              autoFocus
            />
            {erro && (
              <p className="mt-2 text-sm text-red-600">Senha incorreta. Tente novamente.</p>
            )}
          </div>
          
          <button
            type="submit"
            className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold text-white shadow hover:bg-green-700 transition-colors"
          >
            Acessar Painel
          </button>
        </form>
      </div>
    </div>
  );
}