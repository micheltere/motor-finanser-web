import { useState } from 'react';

interface LoginProps {
  onLogin: (senhaDigitada: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.trim() === '') return;
    
    onLogin(senha);
    setErro(true);
    setSenha('');
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0b141a]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Motor FINANSER</h1>
          <p className="mt-1 text-sm text-gray-500">Acesso Restrito</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro(false);
              }}
              className={`block w-full rounded-xl border p-4 text-center tracking-[0.25em] shadow-sm focus:outline-none focus:ring-2 transition-all ${
                erro 
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50' 
                  : 'border-gray-200 focus:border-blue-600 focus:ring-blue-600 bg-gray-50'
              }`}
              placeholder="••••••••"
              autoFocus
            />
            {erro && (
              <p className="mt-2 text-center text-sm font-medium text-red-600">Senha incorreta.</p>
            )}
          </div>
          
          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 px-4 py-4 font-bold text-white shadow-md hover:bg-blue-700 transition-colors"
          >
            Acessar Sistema
          </button>
        </form>
      </div>
    </div>
  );
}