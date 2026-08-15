/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { ArrowRight, X, Zap, FileText, FileSpreadsheet, Globe } from "lucide-react";

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

const SUGGESTION_ICONS = [FileText, FileSpreadsheet, Globe, Zap] as const;

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
    <>
      {/* Trend A+B Hybrid: Organic Mesh Gradient Background - Full viewport */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: -1 }}
      >
        {/* Fluid gradient mesh - 3 independent orbs breathing at different
            speeds. Anchored to the viewport center (calc(50% - Npx)) so they
            stay glued to the centered content at any window width. */}
        <div
          className="absolute left-[calc(50%_-_340px)] top-32 h-[400px] w-[400px] rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] opacity-35 animate-flow-mesh"
          style={{
            background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.3), transparent)",
            animationName: "flow-mesh",
          }}
        />
        <div
          className="absolute right-[calc(50%_-_420px)] bottom-60 h-[360px] w-[360px] rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[90px] opacity-30 animate-flow-mesh"
          style={{
            background: "radial-gradient(circle at center, rgba(14, 165, 233, 0.25), transparent)",
            animationName: "flow-mesh",
            animationDelay: "2s",
          }}
        />
        <div
          className="absolute left-[calc(50%_-_160px)] bottom-28 h-[320px] w-[320px] rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] opacity-25 animate-flow-mesh"
          style={{
            background: "radial-gradient(circle at center, rgba(16, 185, 129, 0.2), transparent)",
            animationName: "flow-mesh",
            animationDelay: "4s",
          }}
        />
        {/* Grain overlay: dithers the soft gradients so 8-bit displays don't
            show color banding (same trick Linear/Stripe use on mesh backgrounds) */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[760px] px-4 pt-8 max-lg:px-4 sm:px-6">
      {/* Header - Minimalist Productivity Style */}
      <div className="animate-ow-hero-rise text-center">
        {/* Section header */}
        <h2 className="mt-2 text-[32px] font-semibold tracking-tight text-dls-text-primary md:text-[36px]">
          <span className="block">我能为你做些什么？</span>
        </h2>
        <p className="mt-2.5 text-[15px] text-muted-foreground">
          一句话描述任务，AI 替你完成写作、分析与自动化
        </p>
      </div>

      {/* Task composer - Minimal flat design */}
      <div className="mt-8 animate-ow-hero-rise" style={{ animationDelay: "120ms" }}>
        <NewTaskComposer
          draft={prompt}
          onDraftChange={setPrompt}
          onRunTask={submit}
          busy={props.busy ?? false}
          context={props.composer ?? null}
        />
      </div>

      {/* OpenWork Models hint - styled like the provider card but inline */}
      {showModelsHint ? (
        <div
          className="animate-ow-hero-rise mt-6 flex items-center justify-center gap-2 text-sm text-dls-secondary"
          data-testid="openwork-models-hint"
          style={{ animationDelay: "200ms" }}
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

      {/* Provider connection card - Streamlined layout */}
      {!showModelsHint &&
      canAddProviders &&
      props.providerCount === 0 &&
      props.onOpenProviderAuth ? (
        <button
          type="button"
          className="animate-ow-hero-rise mt-6 flex w-full items-center gap-4 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left shadow-[var(--dls-card-shadow)] transition-all duration-200 hover:border-blue-7/50 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
          onClick={props.onOpenProviderAuth}
          style={{ animationDelay: "200ms" }}
          aria-label="连接模型提供商"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/90 text-primary-foreground">
            <Zap className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[13px] font-semibold text-dls-text-primary">连接模型提供商</div>
            <div className="mt-0.5 text-xs leading-relaxed text-dls-secondary">
              添加 Anthropic、OpenAI、Google 或其他提供商的 API 密钥以运行任务
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-dls-secondary opacity-50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
        </button>
      ) : null}

      {/* Suggestion cards section - Minimal grid layout */}
      <div className="mt-10">
        {/* Section divider line */}
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-dls-border to-transparent" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-dls-secondary">
            推荐示例
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-dls-border to-transparent" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {suggestions.map((suggestion, index) => {
            const Icon = SUGGESTION_ICONS[index % SUGGESTION_ICONS.length];
            return (
              <button
                key={suggestion.title}
                type="button"
                className="animate-ow-hero-rise group relative flex items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-7/40 hover:bg-zinc-100 hover:shadow-[var(--dls-card-shadow)] dark:hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-9"
                style={{ animationDelay: `${260 + index * 60}ms` }}
                onClick={() => fillPrompt(suggestion.prompt)}
              >
                {/* Icon block - muted state with primary hover */}
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-dls-secondary/50 text-dls-secondary transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-3.5" />
                </span>

                {/* Content - two-line truncation */}
                <div className="relative min-w-0 flex-1 pr-6">
                  <div className="truncate text-sm font-medium text-dls-text-primary">
                    {suggestion.title}
                  </div>
                  <div className="line-clamp-2 text-xs leading-relaxed text-dls-secondary">
                    {suggestion.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}
