import type { Database } from '../db/client'
import { DomainError, PlanError } from '../domain/errors'
import { normalizeSourceUrl } from '../domain/source-url'
import type { OutputType } from '../domain/types'
import { countRunningJobsForUser, updateGenerationJobStage } from '../repositories/generation-jobs'
import type { GenerationParams } from '../workflows/generation'
import { resolvePlan } from './plans'
import { providerKeyStatus } from './provider-keys'
import {
  hasFreeSourceLeftToday,
  hasSourceSlotLeft,
  releaseSourceSlot,
  reserveSourceSlot,
} from './quota'

export const MAX_RUNNING_JOBS = 3

const RUNNING_JOB_WINDOW_MS = 60 * 60 * 1000

type GenerationWorkflowBinding = Pick<Workflow<GenerationParams>, 'create' | 'get'>

export interface GenerationRequestDeps {
  db: Database
  workflow: GenerationWorkflowBinding
  dailySourceLimit: number
  userKeyRequired: boolean
}

export interface GenerationRequestInput {
  userId: string
  url: string
  outputType: OutputType
}

export async function startGeneration(
  deps: GenerationRequestDeps,
  input: GenerationRequestInput,
): Promise<{ jobId: string }> {
  normalizeSourceUrl(input.url)

  const now = new Date()
  const plan = await resolvePlan(deps.db, input.userId)

  if (await hasSourceSlotLeft(deps.db, input.userId, plan, now)) {
    if (plan === 'free' && !(await hasFreeSourceLeftToday(deps.db, deps.dailySourceLimit, now))) {
      throw new PlanError('daily_limit_reached', `${deps.dailySourceLimit} sources started today.`)
    }
    const since = new Date(now.getTime() - RUNNING_JOB_WINDOW_MS)
    const running = await countRunningJobsForUser(deps.db, input.userId, since)
    if (running >= MAX_RUNNING_JOBS) {
      throw new PlanError('too_many_running', `${running} jobs are still running.`)
    }
  }

  if (deps.userKeyRequired && !(await providerKeyStatus(deps.db, input.userId)).set) {
    throw new DomainError('provider_key_required', 'Save an Anthropic key to start a source.')
  }

  const jobId = crypto.randomUUID()
  await reserveSourceSlot(deps.db, {
    plan,
    now,
    job: {
      id: jobId,
      userId: input.userId,
      requestedUrl: input.url,
      outputType: input.outputType,
      workflowInstanceId: jobId,
      createdAt: now,
      updatedAt: now,
    },
  })

  try {
    await deps.workflow.create({
      id: jobId,
      params: {
        jobId,
        userId: input.userId,
        requestedUrl: input.url,
        outputType: input.outputType,
        plan,
      },
    })
  } catch (error) {
    if (await instanceExists(deps.workflow, jobId)) return { jobId }
    await updateGenerationJobStage(deps.db, jobId, {
      status: 'failed',
      errorCode: 'generation_failed',
      errorMessage: 'The generation pipeline could not be started.',
      updatedAt: new Date(),
    })
    await releaseSourceSlot(deps.db, jobId)
    throw error
  }

  return { jobId }
}

async function instanceExists(workflow: GenerationWorkflowBinding, id: string) {
  try {
    await workflow.get(id)
    return true
  } catch {
    return false
  }
}
