import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { api, unwrap } from './api-client'
import type { components } from '@shared/api'

// Support chat (docs/API_CONTRACT.md "Support chat"). No websockets: an open
// chat polls for messages newer than the last one it has; badges poll slowly.

export type SupportMessage = components['schemas']['SupportMessageResource']
export type SupportConversation = components['schemas']['SupportConversationResource']

/** How often an open chat checks for new messages. */
export const CHAT_POLL_MS = 4000
const BADGE_POLL_MS = 60_000

interface Thread {
  messages: SupportMessage[]
  status: 'open' | 'closed' | null
}

/**
 * A chat thread that grows by polling: the first fetch loads the latest
 * messages, later ones only those after the last id already held.
 */
function useThread(
  queryKey: QueryKey,
  fetchMessages: (after?: number) => Promise<Thread>,
  polling: boolean,
  enabled = true,
) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey,
    queryFn: async (): Promise<Thread> => {
      const held = queryClient.getQueryData<Thread>(queryKey)
      const after = held?.messages.at(-1)?.id
      const next = await fetchMessages(after)
      if (after === undefined || !held) return next
      return { status: next.status, messages: [...held.messages, ...next.messages.filter((m) => m.id > after)] }
    },
    refetchInterval: polling ? CHAT_POLL_MS : false,
    refetchIntervalInBackground: false,
    enabled,
  })
}

/** Add a just-sent message to the thread straight away, without waiting for the next poll. */
function appendTo(queryClient: ReturnType<typeof useQueryClient>, queryKey: QueryKey, message: SupportMessage) {
  queryClient.setQueryData<Thread>(queryKey, (held) =>
    held && !held.messages.some((m) => m.id === message.id)
      ? { status: 'open', messages: [...held.messages, message] }
      : held,
  )
}

// ---------------------------------------------------------------- an organization account's own chat

const MY_THREAD = ['support', 'mine']

export function useMySupportThread(open: boolean) {
  return useThread(
    MY_THREAD,
    async (after) => {
      const res = await unwrap(api.GET('/support/messages', { params: { query: { after } } }))
      return { messages: res.data, status: res.meta.status }
    },
    open,
  )
}

export function useMySupportUnread(enabled = true) {
  return useQuery({
    queryKey: ['support', 'mine', 'unread'],
    queryFn: async () => (await unwrap(api.GET('/support/unread'))).data.unread_count,
    refetchInterval: BADGE_POLL_MS,
    enabled,
  })
}

export function useSendSupportMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => (await unwrap(api.POST('/support/messages', { body: { body } }))).data,
    onSuccess: (message) => appendTo(queryClient, MY_THREAD, message),
  })
}

export function useMarkSupportRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.POST('/support/read')
    },
    onSuccess: () => queryClient.setQueryData(['support', 'mine', 'unread'], 0),
  })
}

// ---------------------------------------------------------------- the owner's inbox

export function useSupportConversations(filters: { status?: 'open' | 'closed'; q?: string }) {
  return useQuery({
    queryKey: ['owner', 'support', 'conversations', filters],
    queryFn: () =>
      unwrap(
        api.GET('/owner/support/conversations', {
          params: { query: { ...filters, q: filters.q || undefined, per_page: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
}

export function useSupportInboxUnread(enabled = true) {
  return useQuery({
    queryKey: ['owner', 'support', 'unread'],
    queryFn: async () => (await unwrap(api.GET('/owner/support/unread'))).data.unread_conversations,
    refetchInterval: 30_000,
    enabled,
  })
}

const conversationKey = (id: number) => ['owner', 'support', 'thread', id]

export function useSupportConversationThread(id: number | null) {
  return useThread(
    conversationKey(id ?? 0),
    async (after) => {
      const res = await unwrap(
        api.GET('/owner/support/conversations/{conversation}/messages', {
          params: { path: { conversation: id! }, query: { after } },
        }),
      )
      return { messages: res.data, status: null }
    },
    id !== null,
    id !== null,
  )
}

export function useReplyToSupport(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) =>
      (
        await unwrap(
          api.POST('/owner/support/conversations/{conversation}/messages', {
            params: { path: { conversation: id } },
            body: { body },
          }),
        )
      ).data,
    onSuccess: (message) => {
      appendTo(queryClient, conversationKey(id), message)
      void queryClient.invalidateQueries({ queryKey: ['owner', 'support', 'conversations'] })
    },
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.POST('/owner/support/conversations/{conversation}/read', { params: { path: { conversation: id } } })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner', 'support', 'conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['owner', 'support', 'unread'] })
    },
  })
}

export function useSetConversationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'open' | 'closed' }) =>
      (
        await unwrap(
          api.PUT('/owner/support/conversations/{conversation}', {
            params: { path: { conversation: id } },
            body: { status },
          }),
        )
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'support', 'conversations'] }),
  })
}
