# Serviço PaddleOCR do PriceScan IA

Serviço FastAPI gratuito e local para reconhecer encartes JPG, PNG e WEBP. O endpoint `POST /ocr` retorna texto, coordenadas, confiança e produtos associados aos preços. Nenhuma imagem é enviada para API paga.

## Executar com Docker

Na raiz do projeto:

```bash
docker compose up --build paddle-ocr
```

Configure no Next.js:

```env
PADDLEOCR_URL=http://127.0.0.1:8001
```

Em produção, use a URL HTTPS do serviço PaddleOCR e configure opcionalmente `PADDLEOCR_API_TOKEN` no serviço e `PADDLEOCR_TOKEN` no backend.

Na primeira execução, o PaddleOCR baixa os modelos oficiais para o cache do container. O volume `paddle_models` preserva esse cache entre reinícios.
