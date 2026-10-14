"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  type Clause,
  type CompileEvent,
  type CompiledRule,
  type RuleStatus,
  type Rulebook,
  type TestResult,
} from "@/shared/contract";
import { isLive } from "./live";
import { mockCompileScript } from "./mocks";
import { __mockGetRulebook, __mockSaveRulebook } from "./api";

export interface CompileStreamState {
  isRunning: boolean;
  isDone: boolean;
  error: string | null;
  clauses: Clause[];
  rules: Record<string, CompiledRule>;
  statusByClause: Record<string, { status: RuleStatus; attempt: number }>;
  testResultsByClause: Record<string, TestResult[]>;
  events: CompileEvent[];
  rulebook: Rulebook | null;
}

export interface UseCompileStream extends CompileStreamState {
  start: () => void;
}

const INITIAL: CompileStreamState = {
  isRunning: false,
  isDone: false,
  error: null,
  clauses: [],
  rules: {},
  statusByClause: {},
  testResultsByClause: {},
  events: [],
  rulebook: null,
};

function reduce(s: CompileStreamState, ev: CompileEvent): CompileStreamState {
  const events = [...s.events, ev];
  switch (ev.type) {
    case "started":
      return { ...s, events, isRunning: true };
    case "clause_found": {
      const exists = s.clauses.some((c) => c.id === ev.clause.id);
      const clauses = exists
        ? s.clauses.map((c) => (c.id === ev.clause.id ? { ...c, ...ev.clause } : c))
        : [...s.clauses, ev.clause];
      const statusByClause = s.statusByClause[ev.clause.id]
        ? s.statusByClause
        : { ...s.statusByClause, [ev.clause.id]: { status: "pending" as RuleStatus, attempt: 0 } };
      return { ...s, events, clauses, statusByClause };
    }
    case "classified":
      return {
        ...s,
        events,
        clauses: s.clauses.map((c) => (c.id === ev.clauseId ? { ...c, kind: ev.kind, kindReason: ev.reason } : c)),
      };
    case "rule_status":
      return {
        ...s,
        events,
        statusByClause: { ...s.statusByClause, [ev.clauseId]: { status: ev.status, attempt: ev.attempt } },
      };
    case "test_results":
      return { ...s, events, testResultsByClause: { ...s.testResultsByClause, [ev.clauseId]: ev.results } };
    case "rule_compiled":
      return {
        ...s,
        events,
        rules: { ...s.rules, [ev.rule.clauseId]: ev.rule },
        statusByClause: { ...s.statusByClause, [ev.rule.clauseId]: { status: ev.rule.status, attempt: ev.rule.attempts } },
        testResultsByClause: { ...s.testResultsByClause, [ev.rule.clauseId]: ev.rule.testResults },
      };
    case "done": {
      const rb = ev.rulebook;
      const rules: Record<string, CompiledRule> = { ...s.rules };
      const statusByClause = { ...s.statusByClause };
      const testResultsByClause = { ...s.testResultsByClause };
      for (const rule of rb.rules) {
        rules[rule.clauseId] = rule;
        statusByClause[rule.clauseId] = { status: rule.status, attempt: rule.attempts };
        if (rule.testResults.length) testResultsByClause[rule.clauseId] = rule.testResults;
      }
      return {
        ...s,
        events,
        isRunning: false,
        isDone: true,
        rulebook: rb,
        clauses: rb.clauses.length ? rb.clauses : s.clauses,
        rules,
        statusByClause,
        testResultsByClause,
      };
    }
    case "error":
      // clause-level errors don't end the stream; global ones do
      return ev.clauseId ? { ...s, events } : { ...s, events, isRunning: false, error: ev.message };
    default:
      return s;
  }
}

export function useCompileStream(rulebookId: string): UseCompileStream {
  const [state, setState] = useState<CompileStreamState>(INITIAL);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const es = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    if (es.current) {
      es.current.close();
      es.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);
  // reset when switching rulebooks
  useEffect(() => {
    stop();
    setState(INITIAL);
  }, [rulebookId, stop]);

  const start = useCallback(() => {
    stop();
    setState({ ...INITIAL, isRunning: true });

    if (isLive("compileStream")) {
      let finished = false;
      const source = new EventSource(API.compileStream(rulebookId));
      es.current = source;
      source.onmessage = (msg: MessageEvent<string>) => {
        let ev: CompileEvent;
        try {
          ev = JSON.parse(msg.data) as CompileEvent;
        } catch {
          return;
        }
        setState((s) => reduce(s, ev));
        if (ev.type === "done" || (ev.type === "error" && !ev.clauseId)) {
          finished = true;
          source.close();
          if (es.current === source) es.current = null;
        }
      };
      source.onerror = () => {
        source.close();
        if (es.current === source) es.current = null;
        if (!finished) {
          finished = true;
          setState((s) => (s.isDone ? s : { ...s, isRunning: false, error: "Lost connection to the compile stream." }));
        }
      };
      return;
    }

    const script = mockCompileScript(rulebookId, __mockGetRulebook(rulebookId));
    let at = 0;
    for (const step of script) {
      at += step.delayMs;
      const ev = step.event;
      timers.current.push(
        setTimeout(() => {
          if (ev.type === "done") __mockSaveRulebook(ev.rulebook);
          setState((s) => reduce(s, ev));
        }, at),
      );
    }
  }, [rulebookId, stop]);

  return { ...state, start };
}
