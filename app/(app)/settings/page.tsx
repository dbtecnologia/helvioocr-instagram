import { Cpu, Database, ShieldCheck, SlidersHorizontal } from "lucide-react";

export default function SettingsPage() {
  return <>
    <div className="page-heading"><div><div className="eyebrow">Administração</div><h1>Configurações</h1><p className="subhead">Defina como o PriceScan acessa fontes, processa imagens e protege os dados.</p></div></div>
    <div className="settings-grid">
      <nav className="card settings-nav"><a className="active" href="#ocr"><Cpu size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />OCR gratuito</a><a href="#ocr"><SlidersHorizontal size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />OCR e revisão</a><a href="#storage"><Database size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />Storage</a><a href="#security"><ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />Segurança</a></nav>
      <div className="drawer">
        <section id="ocr" className="card"><div className="card-header"><div><h2>Tesseract.js gratuito</h2><p>Leitura local no navegador, sem API paga e com coordenadas para relacionar preços.</p></div><Cpu size={18} color="#2b8fba" /></div><div className="card-body form-grid"><div className="field"><label>Idioma do OCR</label><select className="select"><option>Português</option><option>Português + inglês</option></select></div><div className="field"><label>Revisão obrigatória</label><select className="select"><option>Ofertas abaixo da confiança mínima</option><option>Todas as ofertas</option></select></div><div className="field full"><div className="notice">A imagem é processada no navegador com Tesseract.js. Produtos ou preços ilegíveis não são inventados e ficam para revisão.</div></div></div></section>
        <section id="storage" className="card"><div className="card-header"><div><h2>Armazenamento privado</h2><p>Imagens originais e derivados devem ficar em bucket privado.</p></div></div><div className="card-body"><div className="notice">Supabase Storage será usado quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estiverem configurados. No modo local, os arquivos ficam em data/uploads.</div></div></section>
        <section id="security" className="card"><div className="card-header"><div><h2>Segurança</h2><p>As chaves de infraestrutura permanecem somente no backend.</p></div></div><div className="card-body"><div className="notice">APIFY_TOKEN e as credenciais do banco nunca são enviados para o navegador. O OCR funciona sem chave.</div></div></section>
      </div>
    </div>
  </>;
}
