# PriceScan IA

Sistema privado de inteligência de preços para transformar encartes em ofertas estruturadas, revisáveis e comparáveis.

## O que já está implementado

- Next.js + React + TypeScript com shell responsivo e navegação administrativa.
- Dashboard com estados vazios reais, indicadores e saúde do pipeline.
- CRUD de supermercados monitorados, com persistência local no desenvolvimento e caminho de persistência via Supabase no servidor.
- Upload em lote de JPG, PNG, WebP, PDF e ZIP com validação de tipo/tamanho, hash e pré-processamento Sharp.
- OCR gratuito com PaddleOCR em serviço FastAPI, retornando texto, polígonos, confiança e produtos associados aos preços; Tesseract local continua disponível como fallback sem custo.
- Schema Zod para impedir que respostas fora do formato sejam salvas como ofertas válidas.
- Tela de revisão humana, comparador, histórico, relatórios e configurações com estados honestos quando ainda não há dados.
- Exportação real de ExcelJS (`/api/reports/excel`) e PDF (`/api/reports/pdf`) usando apenas ofertas aprovadas.
- Migration Supabase com constraints, índices, RLS e bucket privado.
- Workflows importáveis em `n8n/workflows/` para coleta, processamento, relatórios e falhas.
- Docker Compose para Redis e n8n em desenvolvimento local.
- Testes unitários de parsing/validação e smoke test Playwright.

## Rodar localmente

Requisitos: Node.js 22+ (Node 26 também é suportado), npm e, para o fluxo completo, uma conta Supabase. Para OCR principal, Docker ou Python 3.11+ com PaddleOCR.

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

## OCR gratuito com PaddleOCR

O botão da tela **Coleta de encartes** envia o arquivo, inicia `POST /api/process` e leva as ofertas candidatas para **Revisão de ofertas**. O processamento usa PaddleOCR, associa preços aos textos por coordenadas, preserva a confiança e marca leituras ambíguas como `needs_review`. Nenhum produto ou preço é criado quando não há texto confiável.

### Serviço FastAPI

O serviço está em `ocr-service/` e expõe `GET /health` e `POST /ocr`. Para iniciar com Docker:

```bash
docker compose up --build paddle-ocr
```

No `.env.local` do Next.js, use `PADDLEOCR_URL=http://127.0.0.1:8001`. Em produção, aponte essa variável para a URL HTTPS de um serviço compatível com Docker e, opcionalmente, use `PADDLEOCR_TOKEN`/`PADDLEOCR_API_TOKEN`. O adaptador HTTP mantém a chave fora do navegador.

O endpoint aceita JPG, PNG e WEBP até 25 MB. O modelo é baixado pelo PaddleOCR na primeira execução e fica no volume Docker `paddle_models`.

### Instagram via Apify

Configure `APIFY_TOKEN` no `.env.local` (variável somente de servidor). Em **Coleta de encartes**, selecione o supermercado, informe o @ público, escolha o limite e clique em **Buscar publicações**. A integração chama o Actor `apify~instagram-scraper`, persiste publicações com hash único e exibe imagens/carrosséis. Depois selecione as imagens e clique em **Ler com OCR**; elas entram na mesma fila de OCR e revisão do upload manual.

O Actor recebe `directUrls`, `resultsType: "posts"`, `resultsLimit` e `skipPinnedPosts`. A Apify pode cobrar por resultados e não garante acesso a perfis privados; o sistema não solicita nem armazena senha do Instagram. `APIFY_TIMEOUT_MS` limita a chamada e `APIFY_MAX_RESULTS` limita o consumo por coleta.

Para produção, mantenha o serviço PaddleOCR em um worker/contêiner persistente e o upload original no Storage. O conector público do Instagram ainda depende de credenciais e permissões reais.

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
