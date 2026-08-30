# Bate Ponto

MVP de um controle pessoal de jornada construído com **Node.js** puro no backend e uma PWA no frontend. Ele registra entrada, saída, pausas e folgas, calcula as horas líquidas e guarda tudo localmente em `data/registros.json`.

## Como executar

No PowerShell, use `npm.cmd` (em alguns Windows o comando `npm` é bloqueado pela política de scripts):

```powershell
npm.cmd start
```

Abra `http://localhost:3000`. Para testar no celular na mesma rede Wi-Fi, descubra o IP do computador com `ipconfig` e abra `http://SEU-IP:3000` no navegador do celular.

## Estrutura

- `server.js`: servidor HTTP, API e regras de cálculo de horas.
- `public/`: interface responsiva e instalável como PWA.
- `data/registros.json`: banco de dados local criado automaticamente; não deve ser versionado.

## Próximos passos recomendados

1. Autenticação e usuários (JWT + PostgreSQL/SQLite).
2. Jornada configurável, banco de horas, hora extra e relatórios PDF/Excel.
3. Geolocalização e foto no registro, se for um requisito real da empresa.
4. Publicar a API e trocar `data/registros.json` por banco de dados antes de vários usuários usarem o sistema.
