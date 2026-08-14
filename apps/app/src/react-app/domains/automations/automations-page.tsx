/** @jsxImportSource react */
import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarClock,
  Cloud,
  History,
  Monitor,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import type {
  AutomationDetail,
  AutomationRun,
  AutomationRunEvent,
  AutomationSchedule,
  AutomationState,
  CreateAutomation,
} from "@openwork/types/automations"
import { AUTOMATION_FREE_MODEL } from "@openwork/types/automations"

import { createDenClient, DenApiError, readDenSettings } from "@/app/lib/den"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { useDenAuth } from "@/react-app/domains/cloud/den-auth-provider"
import { useDesktopRestriction } from "@/react-app/domains/cloud/desktop-config-provider"
import { ConfirmModal } from "@/react-app/design-system/modals/confirm-modal"
import { AutomationEditor } from "./automation-editor"
import { dispatchAutomationsStateChanged } from "./automation-events"
import { automationExecutionThreadRoute, automationExecutionIdentity } from "./automation-cloud-thread"
import { formatAutomationSchedule, formatAutomationTime } from "./automation-format"
import type { AutomationProviderCatalog } from "./automation-model-options"
import { automationModelOptions, describeAutomationModel } from "./automation-model-options"

const ACTIVE_RUN_STATUSES = new Set<AutomationRun["status"]>(["queued", "claimed", "running"])

function stateLabel(state: AutomationState) {
  if (state === "needs_attention") return "需要关注"
  return state.slice(0, 1).toUpperCase() + state.slice(1)
}

function stateVariant(state: AutomationState): "default" | "secondary" | "destructive" | "outline" {
  if (state === "active") return "default"
  if (state === "needs_attention") return "destructive"
  return state === "inactive" ? "secondary" : "outline"
}

function runVariant(status: AutomationRun["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default"
  if (status === "failed") return "destructive"
  if (ACTIVE_RUN_STATUSES.has(status)) return "secondary"
  return "outline"
}

function runLabel(run: AutomationRun) {
  if (run.status === "skipped" && run.error?.code === "runner_unavailable") {
    return "错过 - 桌面运行器不可用"
  }
  if (run.status === "skipped" && (run.error?.code === "model_access_lost" || run.error?.code === "provider_unavailable")) {
    return "已跳过 - 模型不可用"
  }
  // 根据 status 转中文
  if (run.status === "queued") return "排队中"
  if (run.status === "claimed") return "已认领"
  if (run.status === "running") return "运行中"
  if (run.status === "succeeded") return "成功"
  if (run.status === "failed") return "失败"
  return run.status
}

function ExecutionIcon({ run }: { run: AutomationRun }) {
  return run.executionThread?.executionLocation === "desktop"
    ? <Monitor className="size-3" />
    : <Cloud className="size-3" />
}

function describeError(error: unknown) {
  if (error instanceof DenApiError) {
    if (error.status === 401 || error.status === 403) return "出错了"
    if (error.status === 404) return "自动化工具不存在"
    return error.message
  }
  return error instanceof Error ? error.message : "无法加载自动化工具"
}

function inputFromDetail(detail: AutomationDetail): CreateAutomation {
  return {
    name: detail.automation.name,
    instructions: detail.revision.instructions,
    schedule: detail.revision.schedule,
    model: detail.revision.model,
  }
}

function eventSummary(event: AutomationRunEvent) {
  const payload = event.payload
  const preferred = ["message", "text", "summary", "name", "warning", "error"]
    .flatMap((key) => typeof payload[key] === "string" ? [payload[key]] : [])
    .at(0)
  if (preferred) return preferred
  const serialized = JSON.stringify(payload)
  return serialized === "{}" ? "无额外详情。" : serialized
}

function usageLabel(run: AutomationRun) {
  const input = run.usage.inputTokens === null ? "—" : run.usage.inputTokens.toLocaleString()
  const output = run.usage.outputTokens === null ? "—" : run.usage.outputTokens.toLocaleString()
  const cost = run.usage.costMicros === null ? "—" : `$${(run.usage.costMicros / 1_000_000).toFixed(4)}`
  return `${input} 输入 · ${output} 输出 · ${cost}`
}

function LoadingState() {
  return (
    <div className="space-y-4 p-6" role="status" aria-label="正在加载自动化工具">
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}

export function AutomationsPage(props: { providerCatalog?: AutomationProviderCatalog } = {}) {
  const denAuth = useDenAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState(false)
  const [repairingModel, setRepairingModel] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const settings = readDenSettings()
  const organizationId = settings.activeOrgId?.trim() || null
  const token = settings.authToken?.trim() || null
  const client = useMemo(
    () => token ? createDenClient({ baseUrl: settings.baseUrl, token }) : null,
    [settings.baseUrl, token],
  )
  const selectedId = searchParams.get("automation")?.trim() || null
  const selectedRunId = searchParams.get("run")?.trim() || null
  const selectedThreadId = searchParams.get("thread")?.trim() || null
  const creating = searchParams.get("create") === "1"
  const ready = denAuth.isSignedIn && Boolean(client && organizationId)
  const queryRoot = ["den", "automations", organizationId]
  const zenModelRestricted = useDesktopRestriction("allowZenModel")
  const freeStarterInRuntime = props.providerCatalog === undefined || Boolean(
    props.providerCatalog[AUTOMATION_FREE_MODEL.providerId]?.[AUTOMATION_FREE_MODEL.modelId],
  )

  const listQuery = useQuery({
    queryKey: [...queryRoot, "list"],
    queryFn: () => client!.listAutomations(organizationId!, { limit: 100 }),
    enabled: ready,
    refetchInterval: 15_000,
  })
  const providersQuery = useQuery({
    queryKey: [...queryRoot, "models"],
    queryFn: () => client!.listOrgLlmProviders(organizationId!),
    enabled: ready,
  })
  const detailQuery = useQuery({
    queryKey: [...queryRoot, "detail", selectedId],
    queryFn: () => client!.getAutomation(organizationId!, selectedId!),
    enabled: ready && Boolean(selectedId),
  })
  const runsQuery = useQuery({
    queryKey: [...queryRoot, "runs", selectedId],
    queryFn: () => client!.listAutomationRuns(organizationId!, selectedId!, { limit: 100 }),
    enabled: ready && Boolean(selectedId),
    refetchInterval: 5_000,
  })
  const receiptQuery = useQuery({
    queryKey: [...queryRoot, "receipt", selectedRunId],
    queryFn: () => client!.getAutomationRun(organizationId!, selectedRunId!),
    enabled: ready && Boolean(selectedRunId),
    refetchInterval: (queryState) => {
      const run = queryState.state.data?.run
      return run && ACTIVE_RUN_STATUSES.has(run.status) ? 3_000 : false
    },
  })

  const models = useMemo(
    () => automationModelOptions(providersQuery.data ?? [], {
      includeFreeStarter: !zenModelRestricted && freeStarterInRuntime,
    }),
    [freeStarterInRuntime, providersQuery.data, zenModelRestricted],
  )
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const items = listQuery.data?.items.filter((item) => item.automation.state !== "archived") ?? []
    if (!normalized) return items
    return items.filter((item) => (
      item.automation.name.toLowerCase().includes(normalized)
      || item.revision.instructions.toLowerCase().includes(normalized)
    ))
  }, [listQuery.data, query])

  const openAutomation = (automationId: string | null) => {
    const next = new URLSearchParams()
    if (automationId) next.set("automation", automationId)
    setSearchParams(next)
    setEditing(false)
    setRepairingModel(false)
  }
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoot })
    dispatchAutomationsStateChanged()
  }
  const act = async (key: string, action: () => Promise<void>, success: string) => {
    setBusyAction(key)
    try {
      await action()
      await refresh()
      toast.success(success)
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusyAction(null)
    }
  }

  if (denAuth.status === "checking") return <LoadingState />
  if (!denAuth.isSignedIn) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <Alert variant="warning">
          <Cloud aria-hidden="true" />
          <AlertTitle>出错了</AlertTitle>
          <AlertDescription>
            Den 保留自动化的调度和历史记录。云自动化可以在桌面离线时运行；桌面自动化在此登录的应用连接时运行。
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  if (!organizationId || !client) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <Alert variant="warning">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>选择一个 Den 组织</AlertTitle>
          <AlertDescription>自动化工具属于活动的 Den 组织。</AlertDescription>
        </Alert>
      </div>
    )
  }
  if (listQuery.isLoading) return <LoadingState />
  if (listQuery.error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-6 pt-16 text-center" role="alert">
          <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
          <div>
            <h2 className="font-medium">自动化工具不可用</h2>
            <p className="mt-2 text-sm text-muted-foreground">{describeError(listQuery.error)}</p>
          </div>
          <Button variant="outline" onClick={() => void listQuery.refetch()}><RefreshCw />重试</Button>
      </div>
    )
  }

  if (creating) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="回到自动化工具列表" onClick={() => openAutomation(null)}>
            <ArrowLeft />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">创建自动化工具</h2>
            <p className="text-sm text-muted-foreground">一旦创建将立即生效。</p>
          </div>
        </div>
        <AutomationEditor
          busy={busyAction === "create"}
          modelOptions={models}
          providerCatalog={props.providerCatalog}
          submitLabel="创建并启用"
          onCancel={() => openAutomation(null)}
          onSave={async (input) => {
            setBusyAction("create")
            try {
              const detail = await client.createAutomation(organizationId, input)
              await refresh()
              openAutomation(detail.automation.id)
              toast.success("已创建并启用自动化")
            } catch (error) {
              toast.error(describeError(error))
            } finally {
              setBusyAction(null)
            }
          }}
        />
      </div>
    )
  }

  if (selectedId) {
    if (detailQuery.isLoading) return <LoadingState />
    if (detailQuery.error || !detailQuery.data) {
      return (
        <div className="mx-auto max-w-xl space-y-4 p-6 pt-16 text-center">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p>{describeError(detailQuery.error)}</p>
          <Button variant="outline" onClick={() => openAutomation(null)}>返回自动化工具</Button>
        </div>
      )
    }
    const detail = detailQuery.data
    const task = detail.automation
    const modelNeedsAttention = task.needsAttentionReason?.code === "model_access_lost"
      || task.needsAttentionReason?.code === "provider_unavailable"
    const runs = runsQuery.data?.items ?? []
    const selectedReceipt = receiptQuery.data
    const threadMatches = !selectedThreadId || selectedReceipt?.run.executionThread?.id === selectedThreadId

    if (editing && (detail.revision.executionTarget ?? "desktop") === "desktop") {
      return (
        <div className="mx-auto max-w-3xl space-y-5 p-6">
          <div>
            <h2 className="text-xl font-semibold">编辑自动化工具</h2>
            <p className="text-sm text-muted-foreground">保存将创建未来运行的不可变修订版。</p>
          </div>
          <AutomationEditor
            initial={inputFromDetail(detail)}
            initialKey={detail.revision.id}
            busy={busyAction === "update"}
            openModelPickerOnMount={repairingModel}
            modelOptions={models}
            providerCatalog={props.providerCatalog}
            submitLabel="保存更改"
            onCancel={() => {
              setEditing(false)
              setRepairingModel(false)
            }}
            onSave={async (input) => {
              setBusyAction("update")
              try {
                await client.updateAutomation(organizationId, task.id, input)
                await refresh()
                setEditing(false)
                setRepairingModel(false)
                toast.success("已更新自动化")
              } catch (error) {
                toast.error(describeError(error))
              } finally {
                setBusyAction(null)
              }
            }}
          />
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" aria-label="返回自动化工具" onClick={() => openAutomation(null)}>
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold">{task.name}</h2>
                <Badge variant={stateVariant(task.state)}>{stateLabel(task.state)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{formatAutomationSchedule(detail.revision.schedule)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(detail.revision.executionTarget ?? "desktop") === "desktop" ? <Button variant="outline" onClick={() => {
              setRepairingModel(false)
              setEditing(true)
            }}>编辑</Button> : null}
            {task.state === "active" ? (
              <Button
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void act("deactivate", async () => {
                  await client.deactivateAutomation(organizationId, task.id)
                }, "已停用自动化。正在进行中的运行将继续。")}
              >
                <Square />停用
              </Button>
            ) : task.state === "inactive" ? (
              <Button
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void act("activate", async () => {
                  await client.activateAutomation(organizationId, task.id)
                }, "已启用自动化")}
              >
                <Play />启用
              </Button>
            ) : null}
            <Button
              disabled={busyAction !== null || task.state === "archived" || task.state === "needs_attention"}
              onClick={() => void act("run", async () => {
                const run = await client.runAutomationNow(organizationId, task.id)
                const next = new URLSearchParams({ automation: task.id, run: run.id })
                setSearchParams(next)
              }, "自动化工具已排队")}
            >
              <Play />立即运行
            </Button>
            <Button variant="ghost" size="icon" aria-label="归档自动化" onClick={() => setArchiveOpen(true)}>
              <Archive />
            </Button>
          </div>
        </div>

        {task.needsAttentionReason ? (
          <Alert variant="warning" data-automation-model-attention={modelNeedsAttention || undefined}>
            {modelNeedsAttention ? <AlertTriangle /> : <AlertCircle />}
            <AlertTitle>{modelNeedsAttention ? "模型需要关注" : "需要操作"}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{task.needsAttentionReason?.message || ""}</p>
              {modelNeedsAttention && (detail.revision.executionTarget ?? "desktop") === "desktop" ? (
                <>
                  <p>此自动化已暂停。其指令、日程和运行历史记录不变。</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRepairingModel(true)
                      setEditing(true)
                    }}
                  >
                    选择一个支持的模型
                  </Button>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <div className="space-y-5">
            <Card variant="outline">
              <CardHeader>
                <CardTitle>指令说明</CardTitle>
                <CardDescription>修订版 {detail.revision.version}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-6">{detail.revision.instructions}</p>
              </CardContent>
            </Card>

            <Card variant="outline">
              <CardHeader>
                <CardTitle>{detail.revision.executionTarget === "cloud" ? "OpenWork 云执行" : "桌面执行"}</CardTitle>
                <CardDescription>{detail.revision.executionTarget === "cloud" ? "Den 唤醒云运行时并以无头方式运行此任务，无需桌面。" : "Den 保留调度和持久化历史记录；已连接的桌面在本地运行任务。"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0"><span className="text-muted-foreground">模型</span><p className="break-words">{describeAutomationModel(detail.revision.model, models)}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">下次运行</span><p className="break-words">{task.state === "needs_attention" ? "未安排未来的运行" : formatAutomationTime(task.nextDueAt)}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">运行时限制</span><p className="break-words">{Math.round(detail.revision.maximumRuntimeMs / 60_000)} 分钟</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">集成</span><p className="break-words">可用的 OpenWork Connect 工具集</p></div>
              </CardContent>
            </Card>

            <Card variant="outline">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="size-4" />运行历史</CardTitle>
                <CardDescription>手动和定时运行的持久化收据。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {runsQuery.isLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
                {!runsQuery.isLoading && runs.length === 0 ? <p className="text-sm text-muted-foreground">暂无运行记录。</p> : null}
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={runVariant(run.status)}>{runLabel(run)}</Badge>
                        <span className="text-xs text-muted-foreground">{run.trigger}</span>
                        {run.executionThread ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ExecutionIcon run={run} />{automationExecutionIdentity(run.executionThread).label}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{formatAutomationTime(run.startedAt ?? run.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {!ACTIVE_RUN_STATUSES.has(run.status) ? <span className="text-xs text-muted-foreground">{usageLabel(run)}</span> : null}
                      {ACTIVE_RUN_STATUSES.has(run.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyAction !== null}
                          onClick={() => void act(`cancel:${run.id}`, async () => {
                            await client.cancelAutomationRun(organizationId, run.id)
                          }, "已取消运行")}
                        >取消</Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (run.executionThread) navigate(automationExecutionThreadRoute(run.executionThread))
                          else setSearchParams(new URLSearchParams({ automation: task.id, run: run.id }))
                        }}
                      >打开</Button>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card variant="outline" className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Monitor className="size-4" />执行线程</CardTitle>
                <CardDescription>{selectedRunId ? "运行收据和时间线" : "选择一次运行以检查其执行线程。"}</CardDescription>
              </CardHeader>
            <CardContent>
              {!selectedRunId ? (
                <div className="py-10 text-center text-sm text-muted-foreground">未选择运行。</div>
              ) : receiptQuery.isLoading ? (
                <Skeleton className="h-48 rounded-xl" />
              ) : receiptQuery.error || !selectedReceipt ? (
                <Alert variant="warning"><AlertCircle /><AlertDescription>{describeError(receiptQuery.error)}</AlertDescription></Alert>
              ) : !threadMatches ? (
                <Alert variant="warning"><AlertCircle /><AlertDescription>此云线程不再匹配所选的运行。</AlertDescription></Alert>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={runVariant(selectedReceipt.run.status)}>{runLabel(selectedReceipt.run)}</Badge>
                    {selectedReceipt.run.executionThread ? (
                      <Badge variant="outline"><ExecutionIcon run={selectedReceipt.run} />{automationExecutionIdentity(selectedReceipt.run.executionThread).label}</Badge>
                    ) : selectedReceipt.run.status === "queued" ? (
                      <Badge variant="outline">{selectedReceipt.run.executionTarget === "cloud" ? "等待 OpenWork 云" : "等待桌面运行器"}</Badge>
                    ) : (
                      <Badge variant="outline">{selectedReceipt.run.executionTarget === "cloud" ? <Cloud className="mr-1 h-3 w-3" /> : <Monitor className="mr-1 h-3 w-3" />}{selectedReceipt.run.executionTarget === "cloud" ? "OpenWork 云" : "桌面"}</Badge>
                    )}
                  </div>
                  {selectedReceipt.run.error ? (
                    <Alert variant="destructive"><AlertCircle /><AlertTitle>{selectedReceipt.run.error.code}</AlertTitle><AlertDescription>{selectedReceipt.run.error.message}</AlertDescription></Alert>
                  ) : null}
                  {selectedReceipt.run.resultSummary ? (
                    <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">结果</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedReceipt.run.resultSummary}</p></div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">{usageLabel(selectedReceipt.run)}</div>
                  <ol className="space-y-3 border-s border-border ps-4">
                    {selectedReceipt.events.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -start-[1.2rem] top-1.5 size-2 rounded-full bg-muted-foreground" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{event.type.replaceAll("_", " ")}</span>
                          <time className="text-xs text-muted-foreground">{formatAutomationTime(event.createdAt)}</time>
                        </div>
                        <p className="mt-1 break-words text-xs text-muted-foreground">{eventSummary(event)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ConfirmModal
          open={archiveOpen}
          variant="danger"
          title="归档自动化？"
          message="未来的运行将停止。持久化的运行历史记录将在 Den 中保持可用。"
          confirmLabel="归档"
          cancelLabel="取消"
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => {
            setArchiveOpen(false)
            void act("archive", async () => {
              await client.archiveAutomation(organizationId, task.id)
              openAutomation(null)
            }, "已归档自动化")
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">自动化工具</h2>
            <p className="mt-1 text-sm text-muted-foreground">由 Den 持久化调度，每个自动化在其固定的桌面或 OpenWork 云位置执行。</p>
          </div>
          <Button onClick={() => setSearchParams(new URLSearchParams({ create: "1" }))}><Plus />新建自动化</Button>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          placeholder="搜索自动化工具"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      {filteredItems.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarClock /></EmptyMedia>
            <EmptyTitle>{query ? "无匹配的自动化" : "暂无自动化工具"}</EmptyTitle>
            <EmptyDescription>{query ? "换个关键词试试。" : "在这里创建桌面自动化；当已登录的桌面连接时会运行。从 Web 或云聊天中创建无头云自动化。"}</EmptyDescription>
          </EmptyHeader>
          {!query ? <EmptyContent><Button onClick={() => setSearchParams(new URLSearchParams({ create: "1" }))}><Plus />新建自动化</Button></EmptyContent> : null}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredItems.map((item) => (
            <button
              key={item.automation.id}
              type="button"
              {...(item.automation.state === "needs_attention" ? { "data-automation-needs-attention": true } : {})}
              className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              onClick={() => openAutomation(item.automation.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 truncate font-medium">
                    {item.automation.state === "needs_attention" ? (
                      <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="自动化需要关注" />
                    ) : null}
                    <span className="truncate">{item.automation.name}</span>
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.revision.instructions}</p>
                </div>
                <Badge variant={stateVariant(item.automation.state)}>{stateLabel(item.automation.state)}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatAutomationSchedule(item.revision.schedule)}</span>
                <span>{item.latestRun ? `上次运行: ${item.latestRun.status}` : `下次: ${formatAutomationTime(item.automation.nextDueAt)}`}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
