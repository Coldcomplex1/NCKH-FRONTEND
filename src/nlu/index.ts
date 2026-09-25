import type { CommandParser } from '@/core/parser'
import { ENV } from '@/lib/env'
import { RuleParser } from './ruleParser'

export { RULE_PARSER_ID, RuleParser, parseSync } from './ruleParser'

let parser: CommandParser | null = null

/**
 * The active command parser (VITE_NLU_ENGINE). 'rules' is the default; 'llm' is reserved for the
 * Qwen parser and, until it exists, still returns the rule parser so the demo keeps working.
 */
export function getParser(): CommandParser {
  if (parser) return parser
  // ENV.nlu.engine === 'llm': no LLM parser yet (scope cut) — fall back to the rules.
  void ENV.nlu.engine
  parser = new RuleParser()
  return parser
}
