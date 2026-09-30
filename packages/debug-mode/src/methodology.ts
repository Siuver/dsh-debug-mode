/**
 * Model-facing methodology. Slash-command names never appear here.
 * @module @deepseek-ai/dsh-debug-mode/methodology
 */

import { HANDOFF_TOOL, PROBE_MARK } from './constants.ts'

const EVIDENCE_PLAN_TAG = 'evidence_plan'

export const COMMAND_ECHO_RULE =
  'Do NOT name Debug-mode UI buttons or slash commands in your closing prose or inside <reproduction_steps>: '
  + 'the debug dock already offers Proceed, Done, and Abort. Close with one short line saying what to do — '
  + 'reproduce, capture, answer — never which control to click.'

export const HANDOFF_RULE =
  `Close every round by calling ${HANDOFF_TOOL} as your last action. Pass mode ("reproduce" when the user must run `
  + 'the app, "capture" when they only supply a report or file, "question" when you need an answer before you can '
  + 'plan), the evidence plan array, and the numbered steps the USER performs now. That tool call is the only thing '
  + `that hands the session to the user. <${EVIDENCE_PLAN_TAG}> and <reproduction_steps> in prose are still read `
  + 'for their contents, but they never close a round.'

export const MINIMIZE_USER_INTERVENTION =
  'MINIMIZE USER INTERVENTION. Choose the cheapest reliable evidence method per hypothesis, in this exact order: '
  + '(1) agent_inspection: reuse existing logs/files and run available read/search/test/command tools yourself; '
  + `(2) runtime_probe: if runtime state is required, install ${PROBE_MARK} instrumentation and combine hypotheses into one reproduction; `
  + '(3) user_report: only when a simple manual observation is decisive; '
  + '(4) user_artifact: only when the disputed state cannot be represented reliably by inspection, probes, or a report. '
  + 'NEVER ask the user to run a command you can run yourself. Batch all unavoidable user actions into the fewest reproductions/captures. '
  + 'Do not choose a lower-priority method merely because it is familiar.'

export const CLOSE_ROUND_RULES =
  `If any selected method is runtime_probe, write ${PROBE_MARK} instrumentation into the working tree in THIS turn before closing — probe edits are required and are not a product fix. `
  + `Do not emit <${EVIDENCE_PLAN_TAG}> or <reproduction_steps> for a runtime_probe round until those probes are already on disk. `
  + `A runtime_probe plan without ${PROBE_MARK} markers is an incomplete round: keep going and instrument first. `
  + '<reproduction_steps> lists only actions the user performs now (reproduce, capture, restart). '
  + 'Never include future agent work such as installing probes, reading logs, or analyzing results. '
  + 'agent_inspection, user_report, and user_artifact rounds may close without adding probes.'

export const METHODOLOGY = `\
[DEBUG MODE METHODOLOGY — follow strictly]
This is DSH Debug Mode. Follow the steps in order. Do not skip them.

1. Generate 3-5 precise hypotheses about WHY the bug occurs. Be detailed; prefer
   more hypotheses over fewer. Mark each hypothesis pending until evidence exists.

2. Decide an evidence method for EVERY hypothesis:
   ${MINIMIZE_USER_INTERVENTION}
   If several hypotheses can be answered by one action, list all of their IDs in
   that request's hypothesisIds and emit ONE request instead of serial
   captures/reports.

   Every plan entry needs a concrete rationale. A user_report or user_artifact rationale must explicitly name why BOTH autonomous inspection AND model-added probes cannot answer the hypotheses; a generic statement such as "need more information" is invalid.

3. For runtime_probe rounds, instrument code in THIS turn with probes that test
   ALL remaining hypotheses in parallel. ${CLOSE_ROUND_RULES}
   Do not apply a product fix in this step. NEVER fix without evidence first. Always rely on runtime logs plus code — never code inspection alone. Unit tests are optional and never replace a user reproduction.

   Probe rules:
   - Wrap EACH probe in a collapsible region (\`// #region agent log\` /
     \`// #endregion\`, or the target language equivalent).
   - Mark every probe with \`${PROBE_MARK} <id>\` so the ledger can track it.
   - Every runtime probe MUST append exactly one compact JSON object plus a
     newline to the exact absolute log file shown above.
   - Schema: {"probe":"<id>","hypothesisId":"<A|B|C|...>","ts":<epoch-ms>,"location":"<file:line>","message":"<short>","data":<JSON-serializable-observation>}
   - Include hypothesisId so each log line can confirm or reject one hypothesis.
   - Append; never overwrite or truncate. Open, append, flush, and close promptly.
   - Do not use HTTP, POST, localhost, sockets, or any network transport.
   - Use the target environment's native file API. Console logging may supplement
     the file but never replaces it. Never ask the user to copy console output.
   - Aim for 2-6 probes; at least 1 is required; do not exceed 10.
   - Never log secrets, tokens, passwords, API keys, or PII.
   - The harness truncates the current log file at the start of each round.
     Do not delete, rename, or overwrite that file yourself.

4. Close the round only after step 3 is done for any runtime_probe plan.
   ${HANDOFF_RULE}
   Methods are exactly: agent_inspection, runtime_probe, user_report, user_artifact.
   Use artifactHint only for user_artifact (expected file kind). Give actionable
   numbered capture/report instructions in instructions.

5. Ask the user to reproduce (or capture/report, per the plan). Pass the single
   combined reproduction/capture sequence the USER performs now as the steps
   argument of ${HANDOFF_TOOL} — the dock the user reads is built from that
   call, not from your prose.
   ${CLOSE_ROUND_RULES}
   ${COMMAND_ECHO_RULE}
   Never say "click" or "press Proceed": the dock already offers those actions, and never
   ask the user to reply "done". Remind them to restart the app or service if
   the instrumented code would otherwise be stale.
   Then STOP. The user reproduces out-of-band.
   No logs may be expected for user_report/user_artifact plans: evaluate the
   requested user evidence instead of treating absent probes as a failed round.

6. After the user proceeds: call list_debug_evidence, then read logs with get_debug_logs
   (previous=true for the completed run). Evaluate EACH hypothesis as CONFIRMED,
   REJECTED, or INCONCLUSIVE citing the selected evidence method: hypothesis ID
   plus log-line numbers, a submitted observation, or an attached artifact/report
   path. Empty logs are themselves evidence (path not executed, stale build,
   wrong path, or append failure). After an inconclusive round, reconsider a
   lower-burden method instead of repeating the same user request.

7. Fix only with 100% confidence and evidence proof. Do NOT remove instrumentation yet.
   Keep probes active during the fix so the next reproduction can verify it.
   A speculative fix without evidence is forbidden. If you are not 100%
   confident, do not patch: update probes, add hypotheses if needed, and ask
   for another reproduction.

8. After a fix, ask the user to reproduce again. Compare before/after logs with
   cited entries. Do not claim success without that proof.

9. If verification proves success and the user marks the problem fixed: remove
   every probe, verify with list_debug_probes that the ledger is empty, then
   summarize the root cause and the final fix in 1-2 lines.

   If verification failed: FIRST remove any code changes from rejected hypotheses
   (keep instrumentation and any proven fixes). THEN generate NEW hypotheses from
   different subsystems, add more instrumentation, and reproduce again.

10. After confirmed success: explain the problem and provide a concise summary of
    the fix.`

export const CLEANUP_CONTRACT = `\
[DEBUG MODE — CLEANUP]
The user confirmed the fix. Only two things remain:
1. Remove every debug probe listed in the ledger above, including its
   \`#region agent log\` wrapper, then call list_debug_probes and confirm the
   ledger is empty. Keep the proven fix; remove nothing else.
2. Summarize in 1-2 lines: the root cause and the fix that is staying.
Do not add probes, form new hypotheses, or ask for another reproduction, and do
not call ${HANDOFF_TOOL}: cleanup ends when the ledger is empty and you have
summarized.`

export const CLEANUP_NUDGE =
  `Cleanup is not finished: the probe ledger below is still not empty. Remove each remaining \`${PROBE_MARK}\` marker `
  + 'and its `#region agent log` wrapper from the code, keep the proven fix, then call list_debug_probes to confirm '
  + 'the ledger is empty before summarizing.'

/**
 * First-round start prompt.
 * @param problem - user-authored symptom.
 * @param logFile - absolute JSONL path for this run.
 */
export function buildStartMessage(problem: string, logFile: string): string {
  return (
    `Starting debug mode. Problem report:\n\n${problem}\n\n`
    + `Runtime log file (absolute): ${logFile}\n`
    + "Every probe MUST append one JSON object per line to that exact file using the target environment's native file API. "
    + 'Console logging may supplement the file but never replaces it.\n\n'
    + 'Evidence method protocol — '
    + MINIMIZE_USER_INTERVENTION
    + '\n\n'
    + 'Begin round 1: generate 3-5 precise hypotheses, decide an evidence method for each, and do NOT apply a product fix yet. '
    + CLOSE_ROUND_RULES
    + ' '
    + HANDOFF_RULE
    + ' '
    + 'Call list_debug_evidence whenever you need the request/observation/artifact ledger. '
    + 'Cite evidence as hypothesis ID plus log-line number or attached observation/artifact/report path. '
    + `Then close with ${HANDOFF_TOOL} — prose alone never closes a round. ${COMMAND_ECHO_RULE} Then STOP.`
  )
}

/**
 * Proceed prompt after the user reproduced or captured.
 * @param args - completed run facts.
 */
export function buildProceedMessage(args: {
  run: string
  logCount: number
  userDetails?: string
  hypotheses?: string
  evidenceSummary?: string
}): string {
  const userEvidence = args.userDetails
    ? `User chose PROCEED with additional evidence after run ${args.run}:\n\n${args.userDetails}\n\nTreat these details as evidence alongside the captured logs.\n`
    : `User chose PROCEED after reproducing (run ${args.run} captured ${args.logCount} log entries).\n`
  const logNote = args.logCount === 0
    ? 'No logs were captured: the instrumented code path may not have executed, the build may be stale, the path may be wrong, or the file append may have failed — treat that as a signal. For user_report/user_artifact plans this is expected; evaluate the requested user evidence instead.\n'
    : `Run ${args.run} captured ${args.logCount} log entries (by hypothesis: ${args.hypotheses ?? 'unknown'}). A hypothesis with no entries was not exercised — that is not the same as being rejected.\n`
  const evidenceNote = args.evidenceSummary
    ? `Evidence ledger for the previous round:\n${args.evidenceSummary}\n`
    : ''
  return (
    userEvidence
    + logNote
    + evidenceNote
    + 'Evidence method protocol — '
    + MINIMIZE_USER_INTERVENTION
    + '\n'
    + 'Call list_debug_evidence first, then read the previous run with get_debug_logs (previous=true). '
    + 'Evaluate each hypothesis CONFIRMED/REJECTED/INCONCLUSIVE citing hypothesis ID plus log-line number or attached observation/artifact/report path. '
    + 'Fix only if a hypothesis is confirmed with 100% confidence; keep all probes in place for a verification reproduce. '
    + 'If not confident, re-instrument in this turn without a speculative patch; after an inconclusive round, reconsider a lower-burden method instead of repeating the same user request. '
    + 'If a previous fix failed, first revert code changes from rejected hypotheses. '
    + CLOSE_ROUND_RULES
    + ' '
    + HANDOFF_RULE
    + ' '
    + `Then end with ${HANDOFF_TOOL} — prose alone never closes a round. ${COMMAND_ECHO_RULE} Then STOP.`
  )
}

/**
 * Cleanup prompt after the user marks the problem fixed.
 * @param probesJson - JSON probe ledger.
 * @param evidenceJson - JSON evidence ledger.
 */
export function buildFixedMessage(probesJson: string, evidenceJson = '[]'): string {
  return (
    'User marked the problem FIXED.\n'
    + '1. Remove every debug probe from the code (probe ledger below; verify with list_debug_probes after edits). Do not revert the proven fix.\n'
    + '2. Then summarize in 1-2 lines: root cause, the fix applied, what remains in the working diff.\n'
    + `Probe ledger: ${probesJson}\n`
    + `Evidence ledger (observations and artifacts already collected; reference only): ${evidenceJson}`
  )
}

/**
 * Extract numbered reproduction steps from assistant prose.
 * @param text - assistant message text.
 */
export function extractReproductionSteps(text: string): string[] {
  const match = /<reproduction_steps>\s*([\s\S]*?)\s*<\/reproduction_steps>/i.exec(text)
  if (match === null) return []
  return match[1]!
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Build a system-reminder body.
 * @param body - instruction.
 */
export function reminder(body: string): string {
  return `<system-reminder>\n${body}\n\nYou NEVER answer this reminder with plain text.\n</system-reminder>`
}

/**
 * Reminder when a turn settled without the handoff tool.
 * @param round - round index.
 * @param wroteProse - whether steps or a plan already appeared in prose.
 */
export function handoffNudge(round: number, wroteProse: boolean): string {
  const prose = wroteProse
    ? 'You already described the steps and/or the plan in prose. Prose does not close a round: pass those same '
      + 'values as the `steps` and `plan` arguments, unchanged. '
    : ''
  return reminder(
    `Debug round ${round} ended without the required ${HANDOFF_TOOL} call.\n\n`
    + `${prose}Call ${HANDOFF_TOOL} now with exactly one mode:\n`
    + '1. mode "reproduce" — the user must run the app so the probes record. Pass steps and plan.\n'
    + '2. mode "capture" — the user only supplies a report or a file. Pass steps and plan.\n'
    + '3. mode "question" — you need an answer before you can plan. steps and plan are optional.\n\n'
    + 'That call is the only thing that hands the session to the user. A rejected call names exactly what to fix and the round stays yours. Do not start new work.',
  )
}

export const PROBE_NUDGE = reminder(
  `Your evidence plan selects runtime_probe, but the probe ledger is empty — no ${PROBE_MARK} marker exists anywhere `
  + `in the working tree. Instrument the code now with edit/write — that is required work for this round, not a `
  + `product fix — and only then call ${HANDOFF_TOOL}.\n\n${CLOSE_ROUND_RULES}`,
)
