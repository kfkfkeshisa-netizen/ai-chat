export type ModelPolicy = "accuracy" | "speed" | "balanced" | "cost";

export type ModelInfo = {
  id: string;
  label: string;
  policy: ModelPolicy;
  featureTags: string[];
  description: string;
};

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "gpt-5.1",
    label: "GPT-5.1",
    policy: "accuracy",
    featureTags: ["LLM", "文章生成", "画像入力", "高品質", "深い洞察", "推論"],
    description: "文章生成、画像入力、複雑な相談、深い洞察に向いた高品質モデル。",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    policy: "balanced",
    featureTags: ["LLM", "文章生成", "画像入力", "コスパ", "バランス"],
    description: "品質、速度、コストのバランスがよく、日常利用に向いたモデル。",
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    policy: "cost",
    featureTags: ["LLM", "高速", "低コスト", "要約", "分類"],
    description: "短い質問、要約、分類、軽い変換に向いた高速・低コストモデル。",
  },
];

export const POLICY_LABELS: Record<ModelPolicy, string> = {
  accuracy: "精度優先",
  speed: "速度優先",
  balanced: "コスパ優先",
  cost: "コスト優先",
};

export function selectModel(policy: ModelPolicy): ModelInfo {
  if (policy === "speed") {
    return MODEL_CATALOG.find((model) => model.id === "gpt-5-nano") ?? MODEL_CATALOG[0];
  }

  if (policy === "balanced") {
    return MODEL_CATALOG.find((model) => model.id === "gpt-5-mini") ?? MODEL_CATALOG[0];
  }

  if (policy === "cost") {
    return MODEL_CATALOG.find((model) => model.id === "gpt-5-nano") ?? MODEL_CATALOG[0];
  }

  return MODEL_CATALOG.find((model) => model.id === "gpt-5.1") ?? MODEL_CATALOG[0];
}

type OpenAITextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

export class OpenAIRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
  }
}

export async function createOpenAIResponse(params: {
  apiKey: string;
  model: string;
  input: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      input: params.input,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    throw new OpenAIRequestError(await readErrorMessage(response), response.status);
  }

  const data = (await response.json()) as OpenAITextResponse;
  const text = extractResponseText(data);

  if (!text) {
    throw new OpenAIRequestError("OpenAI APIからテキスト応答を取得できませんでした。");
  }

  return text;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: {
        message?: string;
        type?: string;
      };
    };
    return data.error?.message ?? `OpenAI API request failed: ${response.status}`;
  } catch {
    return `OpenAI API request failed: ${response.status}`;
  }
}

function extractResponseText(data: OpenAITextResponse): string {
  if (data.output_text) {
    return data.output_text.trim();
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}
