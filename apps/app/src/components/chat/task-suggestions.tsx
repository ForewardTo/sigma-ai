"use client"

import {
  DescriptiveButton,
  DescriptiveButtonContent,
  DescriptiveButtonDescription,
  DescriptiveButtonIcon,
  DescriptiveButtonTitle,
} from "@/components/descriptive-button"
import { useMessageList } from "@/components/chat/message-list-provider"
import { cn } from "@/lib/utils"
import { useOrgRestrictions } from "@/react-app/domains/cloud/desktop-config-provider"
import { BoltIcon, CubeIcon, DocumentChartBarIcon, GlobeAltIcon, SparklesIcon } from "@heroicons/react/24/solid"

const CSV_PROMPT =
  "创建一个包含 20 行假客户数据 (姓名、邮箱、公司、收入) 的示例 CSV 文件。然后给我展示数据摘要。"

const BROWSER_PROMPT =
  "在浏览器中打开 craigslist.org 并搜索待售的沙发。展示价格最高的前 5 个结果。"

const ORGANIZATION_PROMPT_TITLES = ["组织提示词 1", "组织提示词 2", "组织提示词 3"]

export function resolveOrganizationPromptCardContent(input: {
  prompt: string
  description?: string
  index: number
}) {
  const title = input.description?.trim()
  return {
    title: title || ORGANIZATION_PROMPT_TITLES[input.index] || "组织提示词",
    description: input.prompt,
    selectionPrompt: input.prompt,
  }
}

interface TaskSuggestionsProps {
  className?: string
}

export function TaskSuggestions({ className }: TaskSuggestionsProps) {
  const { displaySuggestions, providerConnectedCount, dispatchAction, setPrompt } = useMessageList()
  const orgRestrictions = useOrgRestrictions()
  const organizationPrompts = orgRestrictions.onboardingPrompts
  const organizationPromptDescriptions = orgRestrictions.onboardingPromptDescriptions

  if (!displaySuggestions) {
    return null
  }

  const noProviders = providerConnectedCount === 0
  const hasOrganizationPrompts = organizationPrompts !== undefined

  return (
    <div className={cn("@container flex flex-col gap-4 pt-1", className)}>
      <p className="text-muted-foreground font-medium select-none">
        {noProviders
          ? "连接模型提供商以开始:"
          : hasOrganizationPrompts
            ? "尝试组织的提示词:"
            : "试试这些:"}
      </p>
      <div className="grid min-w-0 gap-2 @lg:grid-cols-2 @2xl:grid-cols-3">
        {noProviders ? (
          <DescriptiveButton
            orientation="vertical"
            className="border-blue-7/50 bg-blue-2/30 hover:bg-blue-3/40 @lg:col-span-2 @2xl:col-span-3"
            onClick={() =>
              dispatchAction({
                target: "settings",
                action: "open",
                section: "providers",
              })
            }
          >
            <DescriptiveButtonIcon>
              <BoltIcon className="size-6 text-blue-10" aria-hidden />
            </DescriptiveButtonIcon>
            <DescriptiveButtonContent>
              <DescriptiveButtonTitle>连接模型提供商</DescriptiveButtonTitle>
              <DescriptiveButtonDescription>
                添加 Anthropic、OpenAI、Google 等的 API 密钥
              </DescriptiveButtonDescription>
            </DescriptiveButtonContent>
          </DescriptiveButton>
        ) : null}

        {hasOrganizationPrompts ? (
          organizationPrompts.map((prompt, index) => {
            const card = resolveOrganizationPromptCardContent({
              prompt,
              description: organizationPromptDescriptions?.[index],
              index,
            })
            return (
              <DescriptiveButton key={`${index}-${prompt}`} orientation="vertical" onClick={() => setPrompt(card.selectionPrompt)}>
                <DescriptiveButtonIcon>
                  <SparklesIcon className="size-6 text-purple-10" aria-hidden />
                </DescriptiveButtonIcon>
                <DescriptiveButtonContent>
                  <DescriptiveButtonTitle>{card.title}</DescriptiveButtonTitle>
                  <DescriptiveButtonDescription>{card.description}</DescriptiveButtonDescription>
                </DescriptiveButtonContent>
              </DescriptiveButton>
            )
          })
        ) : (
          <>
            <DescriptiveButton orientation="vertical" onClick={() => setPrompt(CSV_PROMPT)}>
              <DescriptiveButtonIcon>
                <DocumentChartBarIcon className="size-6 text-green-10" aria-hidden />
              </DescriptiveButtonIcon>
              <DescriptiveButtonContent>
                <DescriptiveButtonTitle>编辑 CSV</DescriptiveButtonTitle>
                <DescriptiveButtonDescription>创建示例电子表格</DescriptiveButtonDescription>
              </DescriptiveButtonContent>
            </DescriptiveButton>

            <DescriptiveButton orientation="vertical" onClick={() => setPrompt(BROWSER_PROMPT)}>
              <DescriptiveButtonIcon>
                <GlobeAltIcon className="size-6 text-blue-10" aria-hidden />
              </DescriptiveButtonIcon>
              <DescriptiveButtonContent>
                <DescriptiveButtonTitle>浏览网页</DescriptiveButtonTitle>
                <DescriptiveButtonDescription>在 Craigslist 上搜索沙发</DescriptiveButtonDescription>
              </DescriptiveButtonContent>
            </DescriptiveButton>

            <DescriptiveButton
              orientation="vertical"
              onClick={() =>
                dispatchAction({
                  target: "settings",
                  action: "open",
                  section: "mcps",
                })
              }
            >
              <DescriptiveButtonIcon>
                <CubeIcon className="size-6 text-amber-10" aria-hidden />
              </DescriptiveButtonIcon>
              <DescriptiveButtonContent>
                <DescriptiveButtonTitle>连接扩展</DescriptiveButtonTitle>
                <DescriptiveButtonDescription>添加 MCP 和集成</DescriptiveButtonDescription>
              </DescriptiveButtonContent>
            </DescriptiveButton>
          </>
        )}
      </div>
    </div>
  )
}
