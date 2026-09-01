-- Aumenta $18.00 a cada pago quincenal del tarifario.
-- Sólo afecta cotizaciones nuevas; no modifica solicitudes firmadas ni créditos existentes.
-- Es idempotente: puede ejecutarse nuevamente sin duplicar el aumento.

INSERT INTO credit_options (amount, term_fortnights, fortnight_payment) VALUES
  (1000, 6, 244), (1000, 8, 193), (1000, 10, 163), (1000, 12, 141),
  (1500, 6, 356), (1500, 8, 281), (1500, 10, 234), (1500, 12, 203),
  (2000, 6, 470), (2000, 8, 368), (2000, 10, 307), (2000, 12, 264),
  (2500, 6, 580), (2500, 8, 456), (2500, 10, 380), (2500, 12, 326),
  (3000, 8, 543), (3000, 10, 451), (3000, 12, 386),
  (3500, 8, 631), (3500, 10, 526), (3500, 12, 449),
  (4000, 8, 718), (4000, 10, 596), (4000, 12, 511),
  (4500, 8, 806), (4500, 10, 671), (4500, 12, 573),
  (5000, 8, 893), (5000, 10, 742), (5000, 12, 634),
  (5500, 8, 988), (5500, 10, 817), (5500, 12, 700),
  (6000, 10, 893), (6000, 12, 763)
ON DUPLICATE KEY UPDATE
  fortnight_payment = VALUES(fortnight_payment),
  status = 'activo';
