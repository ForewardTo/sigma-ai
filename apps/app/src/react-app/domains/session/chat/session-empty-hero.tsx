/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { ArrowRight, X, Zap } from "lucide-react";

import { DEFAULT_MODEL } from "@/app/constants";
import type { ComposerAttachment } from "@/app/types";
import { resolveOrganizationPromptCardContent } from "@/components/chat/task-suggestions";
import {
  useCheckDesktopRestriction,
  useOrgRestrictions,
} from "@/react-app/domains/cloud/desktop-config-provider";
import { useDenAuth } from "@/react-app/domains/cloud/den-auth-provider";
import {
  getOpenWorkModelsActionUrl,
  hideOpenWorkModelsPromo,
  isOpenWorkModelsPromoHidden,
  openWorkModelsPromoChangedEvent,
  useOpenWorkModelsPromoEligibility,
} from "@/react-app/domains/cloud/openwork-models-promo";
import { usePlatform } from "@/react-app/kernel/platform";
import {
  NewTaskComposer,
  type NewTaskComposerContext,
} from "./new-task-composer";

type HeroSuggestion = {
  title: string;
  description: string;
  prompt: string;
};

const DEFAULT_SUGGESTIONS: HeroSuggestion[] = [
  {
    title: "总结本周",
    description: "从邮件和日历中提取重点。",
    prompt:
      "总结我的本周：从我已连接的邮件和日历中提取重点，给我一个简短摘要以及需要注意的事项。",
  },
  {
    title: "整理电子表格",
    description: "导入 CSV 文件并描述想要的结果。",
    prompt:
      "创建一个包含 20 行假客户数据（姓名、邮箱、公司、收入）的示例 CSV 文件。然后展示数据摘要。",
  },
  {
    title: "起草文档",
    description: "根据几个要点生成报告、邮件或简报。",
    prompt:
      "起草一份一页的项目简报。先问我需要的要点，然后将它们转化为清晰、结构良好的文档。",
  },
  {
    title: "自动化网页任务",
    description: "使用内置浏览器执行重复步骤。",
    prompt:
      "在浏览器中打开 craigslist.org 并搜索出售的沙发。展示前 5 个带价格的结果。",
  },
];

export type SessionEmptyHeroProps = {
  providerCount: number;
  /** Disable submission while a default workspace is being prepared. */
  busy?: boolean;
  /** Called with the task prompt and attachments; the caller creates the session (and workspace if needed). */
  onRunTask: (prompt: string, attachments: ComposerAttachment[]) => void;
  onOpenProviderAuth?: () => void;
  /** Workspace-scoped wiring for the full composer (skills, agents, models). */
  composer?: NewTaskComposerContext | null;
};

/**
 * Paper "first chat" empty state: the real session composer front and
 * center with suggestion cards below. Suggestions come from desktop
 * policies (organization onboarding prompts) when configured, with
 * built-in defaults otherwise.
 */
export function SessionEmptyHero(props: SessionEmptyHeroProps) {
  const [prompt, setPrompt] = useState("");
  const orgRestrictions = useOrgRestrictions();
  const checkDesktopRestriction = useCheckDesktopRestriction();
  const canAddProviders = !checkDesktopRestriction({
    restriction: "allowCustomProviders",
  });
  const platform = usePlatform();
  const denAuth = useDenAuth();
  const openWorkModelsPromoEligible = useOpenWorkModelsPromoEligibility();
  const [modelsPromoHidden, setModelsPromoHidden] = useState(
    isOpenWorkModelsPromoHidden,
  );

  useEffect(() => {
    const handlePromoChanged = () =>
      setModelsPromoHidden(isOpenWorkModelsPromoHidden());
    window.addEventListener(
      openWorkModelsPromoChangedEvent,
      handlePromoChanged,
    );
    return () =>
      window.removeEventListener(
        openWorkModelsPromoChangedEvent,
        handlePromoChanged,
      );
  }, []);

  // Quiet inline lead to OpenWork Models: replaces the old startup dialog
  // interrupt. Shown only while the session runs on the free starter model
  // (the built-in `opencode` provider) and the hosted offering applies.
  const onFreeStarterModel =
    props.composer?.selectedModel.providerID === DEFAULT_MODEL.providerID;
  const showModelsHint =
    openWorkModelsPromoEligible &&
    !modelsPromoHidden &&
    !props.composer?.openWorkModelsEntitled &&
    onFreeStarterModel;

  const organizationPrompts = orgRestrictions.onboardingPrompts;
  const suggestions: HeroSuggestion[] =
    organizationPrompts !== undefined
      ? organizationPrompts.map((orgPrompt, index) => {
          const card = resolveOrganizationPromptCardContent({
            prompt: orgPrompt,
            description: orgRestrictions.onboardingPromptDescriptions?.[index],
            index,
          });
          return {
            title: card.title,
            description: card.description,
            prompt: card.selectionPrompt,
          };
        })
      : DEFAULT_SUGGESTIONS;

  const submit = (
    resolvedPrompt: string,
    attachments: ComposerAttachment[],
  ) => {
    const trimmedPrompt = resolvedPrompt.trim();
    if (!trimmedPrompt || props.busy) return;
    props.onRunTask(trimmedPrompt, attachments);
  };

  const fillPrompt = (value: string) => {
    setPrompt(value);
    window.dispatchEvent(new Event("openwork:focusPrompt"));
  };

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-4 max-lg:px-4 sm:px-6">
      <div className="space-y-1.5 text-center">
        <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-foreground">
          你需要做什么？
        </h2>
        <p className="text-[13px] text-muted-foreground">告诉我你想做的事</p>
      </div>

      <NewTaskComposer
        draft={prompt}
        onDraftChange={setPrompt}
        onRunTask={submit}
        busy={props.busy ?? false}
        context={props.composer ?? null}
      />

      {showModelsHint ? (
        <div
          className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground"
          data-testid="openwork-models-hint"
        >
          <span>正在使用免费入门模型。</span>
          <button
            type="button"
            className="flex items-center gap-1 font-medium text-blue-10 transition-colors hover:text-blue-11"
            onClick={() =>
              platform.openLink(
                getOpenWorkModelsActionUrl(denAuth.isSignedIn, "sign-up"),
              )
            }
          >
            使用无 API 密钥的前沿模型
            <ArrowRight className="size-3" />
          </button>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
            onClick={hideOpenWorkModelsPromo}
            aria-label="隐藏 OpenWork Models 提示"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}

      {!showModelsHint &&
      canAddProviders &&
      props.providerCount === 0 &&
      props.onOpenProviderAuth ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl border border-blue-7/50 bg-blue-2/40 p-3.5 text-left transition-colors hover:bg-blue-3/50"
          onClick={props.onOpenProviderAuth}
        >
          <Zap className="mt-0.5 size-4 shrink-0 text-blue-10" />
          <div>
            <div className="text-[13px] font-medium text-foreground">
              连接模型提供商
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              添加 Anthropic、OpenAI、Google 或其他提供商的 API 密钥以运行任务
            </div>
          </div>
        </button>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            className="rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:bg-accent"
            onClick={() => fillPrompt(suggestion.prompt)}
          >
            <div className="truncate text-[13px] font-medium text-foreground">
              {suggestion.title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">
              {suggestion.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
