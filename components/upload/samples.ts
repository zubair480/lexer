import type { RecordType } from "@/shared/contract";

export interface RulebookSample {
  title: string;
  clientName: string;
  recordType: RecordType;
  sourceText: string;
}

/** Synthetic Acme Corp Outside Counsel Guidelines (PLAN.md §8). Not a real client document. */
export const ACME_OCG_SAMPLE: RulebookSample = {
  title: "Acme Corp Outside Counsel Billing Guidelines",
  clientName: "Acme Corp",
  recordType: "time_entry",
  sourceText: `ACME CORP — OUTSIDE COUNSEL BILLING GUIDELINES
Effective January 1, 2026 (synthetic document for demonstration purposes)

Section 3. Billing Requirements

3.1 Block Billing. Each time entry must describe a single task. Entries that list multiple tasks in one narrative and exceed 0.5 hours will be rejected in full.

3.2 Vague Narratives. Narratives must clearly describe the work performed and its subject. Entries with narratives of fewer than five words, or that use phrases such as "attention to", "work on file", or "review documents" without identifying the subject matter, will be rejected.

3.3 Staffing. No more than two timekeepers may bill for attendance at the same deposition or meeting. Time billed by any additional timekeeper for the same event will be rejected.

3.4 Travel. Non-working travel time shall be billed at fifty percent (50%) of the timekeeper's standard hourly rate. Amounts billed above that rate will be reduced accordingly.

3.5 Clerical Work. Clerical and administrative tasks, including filing, copying, scheduling, and document organization, are part of firm overhead and are not billable, regardless of who performs them.

3.6 Daily Cap. No timekeeper may bill more than ten (10) hours in a single day on this matter. Hours in excess of the cap will be rejected.

3.7 Reasonableness. All time billed must be reasonable and necessary to the matter. Acme reserves the right to reduce or reject any charge it determines, in its discretion, was not reasonable or necessary.
`,
};

/** Synthetic USCIS H-1B petition checklist (PLAN.md §8). */
export const USCIS_H1B_SAMPLE: RulebookSample = {
  title: "USCIS H-1B Petition Pre-Filing Checklist",
  clientName: "Acme Corp",
  recordType: "h1b_petition",
  sourceText: `H-1B PETITION PRE-FILING CHECKLIST
(Synthetic internal checklist for demonstration purposes)

1. Wage Requirement. The offered wage stated in the petition must be equal to or greater than the prevailing wage listed on the certified Labor Condition Application (LCA).

2. Worksite Coverage. The beneficiary's worksite ZIP code must be one of the worksite locations listed on the certified LCA.

3. Filing Window. The petition may be filed no more than six (6) months before the requested employment start date.
`,
};

export const SAMPLE_INVOICE_CSV = `date,timekeeperId,timekeeperName,role,hours,rate,taskCode,activityCode,narrative
2026-10-01,tk_jr,Jordan Reyes,partner,1.2,950,L120,A104,"Analyze Acme's indemnification claims under the 2024 supply agreement"
2026-10-01,tk_ap,Alex Park,associate,3.5,550,L210,A103,"Draft motion to compel, research case law, and call with client re: discovery schedule"
2026-10-02,tk_ap,Alex Park,associate,0.8,550,L120,A104,"Attention to file"
2026-10-02,tk_mc,Morgan Chen,paralegal,2.0,250,L140,A110,"Organize and file deposition exhibits; copy binders for production"
2026-10-03,tk_jr,Jordan Reyes,partner,6.0,950,L330,A109,"Attend deposition of R. Patel, Acme's VP of Operations"
2026-10-03,tk_ap,Alex Park,associate,6.0,550,L330,A109,"Attend deposition of R. Patel, Acme's VP of Operations"
2026-10-03,tk_sk,Sam Kim,associate,6.0,550,L330,A109,"Attend deposition of R. Patel, Acme's VP of Operations"
2026-10-06,tk_jr,Jordan Reyes,partner,4.0,950,L330,A111,"Non-working travel from New York to Chicago for deposition"
2026-10-06,tk_ap,Alex Park,associate,3.0,550,L330,A111,"Travel to Chicago for deposition and prepared examination outline en route"
2026-10-07,tk_ap,Alex Park,associate,7.5,550,L330,A101,"Prepare examination outline for deposition of K. Liu"
2026-10-07,tk_ap,Alex Park,associate,4.0,550,L330,A104,"Review and annotate K. Liu production documents for deposition"
2026-10-08,tk_sk,Sam Kim,associate,2.4,550,L250,A103,"Draft responses to plaintiff's second set of interrogatories"
2026-10-09,tk_jr,Jordan Reyes,partner,0.5,950,L120,A106,"Call with Acme GC re: settlement posture and mediation timing"
2026-10-10,tk_mc,Morgan Chen,paralegal,1.5,250,L310,A104,"Review documents produced by Beta Logistics for privilege markings"
2026-10-13,tk_ap,Alex Park,associate,2.2,550,L210,A103,"Revise motion to compel based on partner comments"
2026-10-14,tk_sk,Sam Kim,associate,1.8,550,L320,A102,"Research spoliation standards in the Seventh Circuit"
2026-10-15,tk_jr,Jordan Reyes,partner,1.0,950,L160,A106,"Meeting with Acme GC re: settlement strategy and budget"
2026-10-15,tk_ap,Alex Park,associate,1.0,550,L160,A106,"Meeting with Acme GC re: settlement strategy and budget"
2026-10-16,tk_mc,Morgan Chen,paralegal,0.4,250,L140,A110,"Prepare privilege log entries for Beta Logistics production"
2026-10-17,tk_sk,Sam Kim,associate,3.0,550,L240,A103,"Draft reply brief in support of motion to compel, addressing waiver argument"
`;
