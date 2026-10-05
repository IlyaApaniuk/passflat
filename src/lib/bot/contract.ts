import Anthropic from '@anthropic-ai/sdk';

/**
 * Reading a Polish lease for the deposit flow.
 *
 * The statute leaves three things to the contract — its own return deadline,
 * whether repainting is on the tenant, whether cleaning is required — and
 * those decide the verdict. So this extracts exactly those, plus the parties
 * for the letter, and quotes each clause back so the person sees where the
 * answer came from. Nothing here is persisted; the caller decides what to keep.
 */

const MODEL = 'claude-opus-5-5';

export interface ContractFile {
  data: Buffer;
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ContractReading {
  isLease: boolean;
  contractType: 'standard' | 'okazjonalny' | 'instytucjonalny' | 'unknown';
  landlordKind: 'person' | 'company' | 'unknown';
  depositAmount: number | null;
  returnTerm: { value: number; unit: 'days' | 'months' } | null;
  renovation: 'tenant_must_renew' | 'tenant_exempt' | 'not_mentioned';
  cleaning: 'cleaning_required' | 'not_mentioned';
  quotes: { returnTerm: string | null; renovation: string | null; cleaning: string | null };
  parties: {
    landlordName: string | null;
    landlordAddress: string | null;
    tenantName: string | null;
    flatAddress: string | null;
  };
}

const nullableString = { type: ['string', 'null'] };
const nullableInteger = { type: ['integer', 'null'] };

// Structured output: the response is guaranteed to match this schema.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_lease',
    'contract_type',
    'landlord_kind',
    'deposit_amount_pln',
    'deposit_return',
    'renovation',
    'cleaning',
    'parties',
  ],
  properties: {
    is_lease: { type: 'boolean' },
    contract_type: {
      type: 'string',
      enum: ['standard', 'okazjonalny', 'instytucjonalny', 'unknown'],
    },
    landlord_kind: { type: 'string', enum: ['person', 'company', 'unknown'] },
    deposit_amount_pln: nullableInteger,
    deposit_return: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'unit', 'quote'],
      properties: {
        value: nullableInteger,
        unit: { type: 'string', enum: ['days', 'months', 'none'] },
        quote: nullableString,
      },
    },
    renovation: {
      type: 'object',
      additionalProperties: false,
      required: ['rule', 'quote'],
      properties: {
        rule: { type: 'string', enum: ['tenant_must_renew', 'tenant_exempt', 'not_mentioned'] },
        quote: nullableString,
      },
    },
    cleaning: {
      type: 'object',
      additionalProperties: false,
      required: ['rule', 'quote'],
      properties: {
        rule: { type: 'string', enum: ['cleaning_required', 'not_mentioned'] },
        quote: nullableString,
      },
    },
    parties: {
      type: 'object',
      additionalProperties: false,
      required: ['landlord_name', 'landlord_address', 'tenant_name', 'flat_address'],
      properties: {
        landlord_name: nullableString,
        landlord_address: nullableString,
        tenant_name: nullableString,
        flat_address: nullableString,
      },
    },
  },
} as const;

const INSTRUCTIONS = `You are reading a residential lease agreement from Poland (umowa najmu lokalu mieszkalnego), possibly as photos of its pages. A tenant wants their deposit (kaucja) back; extract only what bears on that.

- is_lease: false if the document is not a residential lease (then fill everything else with null / "unknown" / "not_mentioned" / "none").
- contract_type: "okazjonalny" for najem okazjonalny, "instytucjonalny" for najem instytucjonalny, otherwise "standard"; "unknown" if unreadable.
- landlord_kind: "company" if the landlord (wynajmujący) is a company (sp. z o.o., S.A., spółka, fundacja, agency acting as landlord), "person" if a natural person.
- deposit_amount_pln: the kaucja amount in whole złoty, if stated.
- deposit_return: the deadline the contract itself sets for returning the kaucja (e.g. "w terminie 14 dni" → value 14, unit "days"; "w ciągu 2 miesięcy" → 2, "months"). unit "none" and value null if the contract sets no deadline of its own.
- renovation: "tenant_must_renew" if the contract obliges the tenant to repaint or renovate (malowanie, odnowienie lokalu) when leaving; "tenant_exempt" if it says the tenant need not, or that repainting is the landlord's cost; "not_mentioned" otherwise.
- cleaning: "cleaning_required" if the contract requires returning the flat cleaned (e.g. professional cleaning, sprzątanie) at the tenant's cost; otherwise "not_mentioned".
- quote fields: the exact clause wording in Polish, at most 300 characters, or null when not found.
- parties: names and addresses as written in the contract, or null.

Never infer what the document does not say. If a page is unreadable, treat its content as not found.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

type RawReading = {
  is_lease: boolean;
  contract_type: ContractReading['contractType'];
  landlord_kind: ContractReading['landlordKind'];
  deposit_amount_pln: number | null;
  deposit_return: { value: number | null; unit: 'days' | 'months' | 'none'; quote: string | null };
  renovation: { rule: ContractReading['renovation']; quote: string | null };
  cleaning: { rule: ContractReading['cleaning']; quote: string | null };
  parties: {
    landlord_name: string | null;
    landlord_address: string | null;
    tenant_name: string | null;
    flat_address: string | null;
  };
};

function toReading(raw: RawReading): ContractReading {
  const term = raw.deposit_return;
  // A deadline outside a sane range is a misread, not a contract term.
  const termValid =
    term.unit !== 'none' &&
    term.value != null &&
    term.value > 0 &&
    term.value <= (term.unit === 'days' ? 180 : 6);

  return {
    isLease: raw.is_lease,
    contractType: raw.contract_type,
    landlordKind: raw.landlord_kind,
    depositAmount:
      raw.deposit_amount_pln != null && raw.deposit_amount_pln > 0 ? raw.deposit_amount_pln : null,
    returnTerm: termValid ? { value: term.value!, unit: term.unit as 'days' | 'months' } : null,
    renovation: raw.renovation.rule,
    cleaning: raw.cleaning.rule,
    quotes: {
      returnTerm: termValid ? term.quote : null,
      renovation: raw.renovation.quote,
      cleaning: raw.cleaning.quote,
    },
    parties: {
      landlordName: raw.parties.landlord_name,
      landlordAddress: raw.parties.landlord_address,
      tenantName: raw.parties.tenant_name,
      flatAddress: raw.parties.flat_address,
    },
  };
}

class ContractReadError extends Error {}

export async function readContract(files: ContractFile[]): Promise<ContractReading> {
  if (!files.length) throw new ContractReadError('no files');

  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((file) =>
    file.mediaType === 'application/pdf'
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: file.data.toString('base64'),
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mediaType,
            data: file.data.toString('base64'),
          },
        },
  );
  content.push({ type: 'text', text: INSTRUCTIONS });

  const response = await getClient().beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16000,
      // Extraction from a document: medium effort is enough and keeps it fast.
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      // On a safety decline, rerun on Anthropic's recommended fallback model
      // instead of failing the person's request.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    },
    { timeout: 90_000 },
  );

  if (response.stop_reason === 'refusal') throw new ContractReadError('refused');
  if (response.stop_reason === 'max_tokens') throw new ContractReadError('truncated');

  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new ContractReadError('no output');

  try {
    return toReading(JSON.parse(text.text) as RawReading);
  } catch {
    throw new ContractReadError('unparseable output');
  }
}
