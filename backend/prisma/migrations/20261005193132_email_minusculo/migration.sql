-- Escrito à mão (D28): e-mail sempre em minúsculas. O login compara o e-mail exatamente;
-- um e-mail gravado com maiúscula por seed ou inserção direta deixaria a conta sem acesso.
ALTER TABLE "Funcionario" ADD CONSTRAINT funcionario_email_minusculo CHECK ("email" = lower("email"));
ALTER TABLE "Cliente" ADD CONSTRAINT cliente_email_minusculo CHECK ("email" = lower("email"));
