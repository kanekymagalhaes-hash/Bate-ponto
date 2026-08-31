# Aplicativo mobile — Bate Ponto

Este aplicativo React Native consome a API Node.js que está na raiz do repositório.

## Primeira execução

1. Na raiz do projeto, execute `npm.cmd start` para ligar o servidor.
2. Execute `ipconfig` e copie o endereço IPv4 da sua rede Wi-Fi, por exemplo `192.168.0.15`.
3. Altere `mobile/src/config.js` para `http://192.168.0.15:3000`.
4. Em outro terminal, entre em `mobile` e rode `npm.cmd install` e `npm.cmd start`.
5. Instale o **Expo Go** no celular, escaneie o QR Code e mantenha celular e computador na mesma rede Wi-Fi.

`localhost` não funciona no celular, porque nele significa o próprio aparelho.
