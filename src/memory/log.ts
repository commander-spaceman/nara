const DIM = "color: #888";
const BOLD = "font-weight: bold";

export const LOG = {
  llm: { tag: "%cLLM %c", tagColor: `${BOLD}; color: #8ab4f8`, dim: DIM },
  ctx: { tag: "%cCTX %c", tagColor: `${BOLD}; color: #d0a0ff`, dim: DIM },
  db: { tag: "%cDB  %c", tagColor: `${BOLD}; color: #f0c040`, dim: DIM },
  cold: { tag: "%cCOLD%c", tagColor: `${BOLD}; color: #5fd0db`, dim: DIM },
  facts: { tag: "%cFACT%c", tagColor: `${BOLD}; color: #5fdb90`, dim: DIM },
  key: { tag: "%cKEY %c", tagColor: `${BOLD}; color: #e0905f`, dim: DIM },
};

export function log(
  channel: typeof LOG.llm,
  message: string,
  detail?: string,
): void {
  if (detail) {
    console.log(
      `${channel.tag}${message} %c${detail}`,
      channel.tagColor,
      channel.dim,
      DIM,
    );
  } else {
    console.log(channel.tag + message, channel.tagColor, channel.dim);
  }
}
