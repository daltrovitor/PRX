// Hello World
"use client";

import { Field, Input } from "@/components/app/ui";
import type { TicketQuote } from "@/lib/live/service";

/**
 * Campos da regra de idade na compra (ingresso e inscrição da RUN): a data de
 * nascimento, quando a conta ainda não tem, e o e-mail do responsável legal, quando
 * o comprador é menor de 18 anos. Quem decide o que aparece é o servidor (quote.age).
 */
export function AgeFields({
  age,
  ageRating,
  birthDate,
  onBirthDate,
  parentEmail,
  onParentEmail,
}: {
  age: TicketQuote["age"] | undefined;
  ageRating: string;
  birthDate: string;
  onBirthDate: (value: string) => void;
  parentEmail: string;
  onParentEmail: (value: string) => void;
}) {
  if (!age) return null;
  const rated = age.minAge !== null && age.minAge > 0;
  return (
    <>
      {age.needsBirthDate && (
        <Field
          label="Sua data de nascimento"
          hint={`${
            rated ? `Este evento é ${ageRating}.` : "Precisamos da data para saber se você precisa da liberação de um responsável."
          } A data fica na sua conta, é conferida com seu CPF quando possível e não pode ser alterada pelo app.`}
        >
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="date" value={birthDate} onChange={(e) => onBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />}
        </Field>
      )}
      {age.requiresParentEmail && (
        <Field
          label="E-mail do seu responsável legal"
          hint="Como você é menor de idade, seu responsável legal recebe um link seguro por e-mail para liberar sua entrada neste evento (ECA, Lei 8.069/1990). O QR Code só vale depois da liberação."
        >
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="email"
              placeholder="responsavel@email.com"
              value={parentEmail}
              onChange={(e) => onParentEmail(e.target.value)}
              autoComplete="email"
            />
          )}
        </Field>
      )}
    </>
  );
}
