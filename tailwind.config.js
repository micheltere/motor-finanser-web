/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zap: {
          fundo: '#efeae2',
          barra: '#f0f2f5',
          verdeClaro: '#d9fdd3',
          verdeEscuro: '#00a884',
          texto: '#111b21',
          textoSecundario: '#667781'
        }
      }
    },
  },
  plugins: [],
}