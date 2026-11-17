import { analysePosition } from './analyse.ts';
import type { AnalyseRequest, AnalyseResponse } from './protocol.ts';

self.onmessage = (event: MessageEvent<AnalyseRequest>) => {
  const { id, state, options } = event.data;
  const response: AnalyseResponse = { id, analysis: analysePosition(state, options) };
  self.postMessage(response);
};
