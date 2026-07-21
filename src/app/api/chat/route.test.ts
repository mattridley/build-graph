import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handleChatRequest } from '@/app/api/chat/route'

const createQuestionInvestigation = vi.fn()

function request(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-buildgraph-ai-gateway-key': 'user-owned-gateway-key-for-tests',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/chat', () => {
  beforeEach(() => createQuestionInvestigation.mockReset())

  it('rejects malformed history before starting an investigation', async () => {
    const response = await handleChatRequest(
      request({ messages: [{ role: 'user' }] }),
      createQuestionInvestigation,
    )
    expect(response.status).toBe(400)
    expect(createQuestionInvestigation).not.toHaveBeenCalled()
    expect(await response.text()).not.toMatch(/stack|DATABASE_URL|secret/i)
  })

  it('returns a valid unsupported UI message stream', async () => {
    createQuestionInvestigation.mockResolvedValue({ kind: 'unsupported' })
    const response = await handleChatRequest(
      request({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Write release announcement copy.' }],
          },
        ],
      }),
      createQuestionInvestigation,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
    const body = await response.text()
    expect(body).toContain('data-unsupported')
    expect(body).not.toContain('data-investigation')
    expect(createQuestionInvestigation).toHaveBeenCalledWith(
      'Write release announcement copy.',
      undefined,
      { gatewayApiKey: 'user-owned-gateway-key-for-tests' },
    )
  })

  it('refuses AI analysis without a user-owned API key', async () => {
    const response = await handleChatRequest(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'Can Atlas ship?' }],
            },
          ],
        }),
      }),
      createQuestionInvestigation,
    )
    expect(response.status).toBe(401)
    expect(createQuestionInvestigation).not.toHaveBeenCalled()
    expect(await response.text()).toContain('user_api_key_required')
  })

  it('normalizes task-trigger failures without provider or database detail', async () => {
    const failingCreate = vi.fn(async () => {
      throw new Error(
        'postgres://user:password@host and TRIGGER_SECRET_KEY=abc',
      )
    })
    const response = await handleChatRequest(
      request({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Can Atlas ship?' }],
          },
        ],
      }),
      failingCreate,
    )
    expect(response.status).toBe(503)
    expect(await response.text()).toBe(
      '{"error":{"code":"investigation_unavailable","detail":"The investigation is temporarily unavailable."}}',
    )
  })
})
