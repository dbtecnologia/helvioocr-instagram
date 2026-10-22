# PriceScan IA

Sistema privado de inteligência de preços para transformar encartes em ofertas estruturadas, revisáveis e comparáveis.

## O que já está implementado

- Next.js + React + TypeScript com shell responsivo e navegação administrativa.
- Dashboard com estados vazios reais, indicadores e saúde do pipeline.
- CRUD de supermercados monitorados, com persistência local no desenvolvimento e caminho de persistência via Supabase no servidor.
- Upload em lote de JPG, PNG, WebP, PDF e ZIP com validação de tipo/tamanho, hash e pré-processamento Sharp.
- Endpoint de processamento com OCR.space (Engine 2, idioma automático e overlay de coordenadas) quando `OCR_SPACE_API_KEY` estiver configurada, parsing de preços brasileiros e extração multimodal estruturada via OpenAI Responses API quando a chave estiver configurada. Sem a chave do OCR.space, o sistema usa o fallback local; resultados sem confiança entram para revisão humana sem inventar dados.
- Schema Zod para impedir que respostas fora do formato sejam salvas como ofertas válidas.
- Tela de revisão humana, comparador, histórico, relatórios e configurações com estados honestos quando ainda não há dados.
- Exportação real de ExcelJS (`/api/reports/excel`) e PDF (`/api/reports/pdf`) usando apenas ofertas aprovadas.
- Migration Supabase com constraints, índices, RLS e bucket privado.
- Workflows importáveis em `n8n/workflows/` para coleta, processamento, relatórios e falhas.
- Docker Compose para Redis e n8n em desenvolvimento local.
- Testes unitários de parsing/validação e smoke test Playwright.

## Rodar localmente

Requisitos: Node.js 22+ (Node 26 também é suportado), npm e, para o fluxo completo, uma conta Supabase e uma chave de IA.

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Sem variáveis Supabase, o projeto usa um fallback local em `data/store.json` e `data/uploads/`. Esse modo é útil para validar a interface e o CRUD, mas não deve ser usado para produção.

## Configuração Supabase

1. Crie um projeto Supabase.
2. Execute `supabase/migrations/20261022000000_initial.sql` no SQL Editor ou via Supabase CLI.
3. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET`.
4. Crie o primeiro usuário administrativo no Supabase Auth.
5. Defina `ALLOW_LOCAL_FALLBACK=false` em produção.

O `service_role` é usado somente em rotas de servidor. Nunca publique essa variável com o prefixo `NEXT_PUBLIC_`.

## OCR e IA

O botão da tela **Coleta de encartes** já envia o arquivo, inicia `POST /api/process` e leva as ofertas candidatas para **Revisão de ofertas**. O endpoint executa o pré-processamento Sharp, OCR Tesseract, valida preços em formato brasileiro e, com `OPENAI_API_KEY`, envia imagem + OCR para um modelo multimodal. A resposta precisa obedecer ao schema Zod e ofertas de baixa confiança entram como `needs_review`.

### OCR.space e fallback local

Configure `OCR_SPACE_API_KEY` no `.env.local` (variável somente de servidor). O backend envia o JPG/PNG para `https://api.ocr.space/parse/image` com `OCREngine=2`, `language=auto`, `isOverlayRequired=true` e associa preços aos rótulos usando as coordenadas retornadas quando disponíveis. A resposta é validada, limites/timeout são tratados e a chave nunca vai para o frontend.

`OCR_LOCAL_FALLBACK=true` mantém o Tesseract local como fallback. Para usar o adaptador opcional de PaddleOCR 3.x sem chave, instale `paddlepaddle` e `paddleocr` no ambiente Python, defina `PADDLEOCR_ENABLED=true` e `PADDLEOCR_PYTHON` antes de reiniciar o servidor. O adaptador usa os polígonos detectados para associar cada preço à coluna correta do produto e desativa MKLDNN por compatibilidade em alguns Windows.

### Instagram via Apify

Configure `APIFY_TOKEN` no `.env.local` (variável somente de servidor). Em **Coleta de encartes**, selecione o supermercado, informe o @ público, escolha o limite e clique em **Buscar publicações**. A integração chama o Actor `apify~instagram-scraper`, persiste publicações com hash único e exibe imagens/carrosséis. Depois selecione as imagens e clique em **Extrair preços com IA**; elas entram na mesma fila de OCR e revisão do upload manual.

O Actor recebe `directUrls`, `resultsType: "posts"`, `resultsLimit` e `skipPinnedPosts`. A Apify pode cobrar por resultados e não garante acesso a perfis privados; o sistema não solicita nem armazena senha do Instagram. `APIFY_TIMEOUT_MS` limita a chamada e `APIFY_MAX_RESULTS` limita o consumo por coleta.

Para produção, execute esse endpoint em um worker persistente (BullMQ/Redis ou n8n) e mantenha o upload original no Storage. O scaffold já deixa a separação de rota e os workflows pronta; o conector autorizado do Instagram ainda depende de credenciais e permissões reais.

## n8n

Suba o ambiente local com:

```bash
docker compose up -d
```

Abra `http://localhost:5678` e importe os quatro JSONs em `n8n/workflows/`. Configure `PRICESCAN_API_URL` e `PRICESCAN_AUTOMATION_TOKEN` como variáveis/credenciais do n8n. Não use webhooks públicos sem autenticação.

## Exportações

- `GET /api/reports/excel`: workbook `.xlsx` com abas Resumo e Dados detalhados, filtros, cabeçalho e formatos numéricos.
- `GET /api/reports/pdf`: PDF A4 básico com ofertas aprovadas, preços e data de geração.

Antes de disponibilizar em produção, acrescente paginação do PDF, gráficos selecionáveis e filtros de relatório na API, mantendo as mesmas regras de aprovação e rastreabilidade.

## Testes

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

O teste E2E usa o fallback local quando as variáveis Supabase não estão definidas.

## Limitações e próximos incrementos

- A coleta automática do Instagram não é declarada como concluída: a Graph API e provedores externos exigem conta, permissões e credenciais autorizadas.
- A associação de produto/preço depende de revisão quando OCR ou IA não têm confiança suficiente.
- A fila BullMQ deve ser o próximo passo para processamentos grandes; o Docker Compose já disponibiliza Redis.
- O comparador exige ofertas aprovadas e ainda deve ganhar confirmação explícita de equivalência de produtos.
- Para LGPD e operação contínua, configure backup Supabase, retenção, logs de auditoria e rotação de segredos.
