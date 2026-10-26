/* ============================================================
   Martelo Live — números do Mercado (economia persistente)
   Tudo o que dá para calibrar fica aqui. O servidor e o navegador leem o mesmo arquivo.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MarketConfig = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
    /* ---------- carteira ---------- */
    signupBonus: 30,          // boas-vindas ao criar a conta (0 = nada)
    allowance: 30,            // mesada semanal, igual para todos
    allowanceDay: 1,          // dia do ciclo: 0 = domingo, 1 = segunda … 6 = sábado
    allowanceHour: 0,         // hora do ciclo, no fuso abaixo
    tzOffsetMin: -180,        // fuso do ciclo em minutos (Brasília = UTC-3)
    allowanceCatchUp: 1,      // semanas perdidas pagas de uma vez se o servidor ficou fora (1 = não acumula)

    /* ---------- contas ---------- */
    signupOpen: true,         // false = ninguém novo cria conta
    passwordMin: 6,
    sessionDays: 90,          // quanto tempo o login fica salvo no aparelho
    loginTries: 5,            // tentativas erradas antes de bloquear
    loginWindowMin: 5,        // por quantos minutos o bloqueio vale
    ledgerView: 30            // lançamentos mostrados no extrato
  };
});
