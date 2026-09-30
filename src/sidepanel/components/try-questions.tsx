import { useId, useRef, useState } from "react";
import { ChevronDown, CornerDownRight } from "@/sidepanel/components/icons";
import { Eyebrow } from "@/sidepanel/components/ui/eyebrow";

/**
 * Ready-made questions, reachable at any point in a conversation.
 *
 * Unlike the quick prompts, these do not disappear once a chat starts: each one
 * exercises a different part of the product — explain, fill, stop, report — and
 * the most telling ones only make sense mid-flow. Like the quick prompts, a pick
 * is sent as the plain sentence, so the user sees exactly what was asked.
 */

interface QuestionGroup {
  title: string;
  questions: readonly string[];
}

const GROUPS: readonly QuestionGroup[] = [
  {
    title: "Understand the page",
    questions: [
      "What is this website for?",
      "I want to renew my driver's licence. What should I click first?",
      "What is this page asking me for?",
      "What documents do I need for a new driver's licence?",
    ],
  },
  {
    title: "Fill the form",
    questions: [
      "Fill this form with my details.",
      "Why didn't you fill the password field?",
      "What did you fill in, and did everything work?",
    ],
  },
  {
    title: "Where it stops",
    questions: [
      "Can you enter the OTP for me?",
      "Can you make the payment for me?",
      "Click Submit for me.",
      "Why did you stop here?",
    ],
  },
];

export interface TryQuestionsProps {
  /** A turn or a fill is in flight; a second one cannot start on top of it. */
  disabled: boolean;
  onPick: (question: string) => void;
}

export function TryQuestions({ disabled, onPick }: TryQuestionsProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  function pick(question: string) {
    // Closing makes the picked button inert, so focus returns to the toggle
    // rather than being dropped on the body.
    setExpanded(false);
    toggleRef.current?.focus();
    onPick(question);
  }

  return (
    <section className="flex-none border-t border-rule bg-surface">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex h-9 w-full items-center gap-2 px-4 text-left text-[13px] font-medium text-green-900 transition-colors duration-150 hover:bg-green-50/60"
      >
        <span className="min-w-0 flex-1 truncate">Try a question</span>
        <ChevronDown
          size={12}
          className={`flex-none text-ink-faint transition-transform duration-150 motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-150 motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div id={listId} inert={!expanded} className="overflow-hidden">
          <div className="max-h-[45vh] overflow-y-auto px-4 pb-3">
            {GROUPS.map((group) => (
              <QuestionList
                key={group.title}
                group={group}
                disabled={disabled}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface QuestionListProps {
  group: QuestionGroup;
  disabled: boolean;
  onPick: (question: string) => void;
}

function QuestionList({ group, disabled, onPick }: QuestionListProps) {
  const titleId = useId();

  return (
    <div role="group" aria-labelledby={titleId} className="mt-2 first:mt-0.5">
      <Eyebrow id={titleId}>{group.title}</Eyebrow>

      <ul className="mt-1.5 flex flex-col gap-1.5">
        {group.questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(question)}
              className="flex w-full items-center gap-2 rounded-lg border border-rule bg-page px-3 py-2 text-left transition-colors duration-150 hover:border-green-900/35 hover:bg-green-50/40 disabled:opacity-50 disabled:hover:border-rule disabled:hover:bg-page"
            >
              {/* Wraps rather than truncates — a question cut off is not one. */}
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">
                {question}
              </span>
              <CornerDownRight size={13} className="flex-none text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
