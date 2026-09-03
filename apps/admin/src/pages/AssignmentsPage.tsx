import { useEffect, useMemo, useState } from 'react'
import type { ApiUser, DashboardAccount } from '@laap/types'
import { api, ApiError } from '../lib/api'
import { GlassCard } from '../components/GlassCard'
import type { AssignmentRow } from '../components/assignments/types'
import { OperatorSelector } from '../components/assignments/OperatorSelector'
import { OperatorDossierHeader } from '../components/assignments/OperatorDossierHeader'
import { GrantAccessForm } from '../components/assignments/GrantAccessForm'
import { AssignedAccountsList } from '../components/assignments/AssignedAccountsList'
import { GlobalAssignmentsTable } from '../components/assignments/GlobalAssignmentsTable'

type AssignmentsPageProps = {
  initialAccounts: DashboardAccount[]
  offline: boolean
  onToast: (message: string) => void
}

export function AssignmentsPage({ initialAccounts, offline, onToast }: AssignmentsPageProps) {
  const [rows, setRows] = useState<AssignmentRow[]>([])
  const [accounts, setAccounts] = useState(initialAccounts)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [userSearch, setUserSearch] = useState('')
  const [viewMode, setViewMode] = useState<'by-user' | 'all'>('by-user')
  const [saving, setSaving] = useState(false)
  const [revokingKey, setRevokingKey] = useState<string | null>(null)

  const refresh = async () => {
    if (offline) return
    try {
      const [assignmentResult, accountResult, userResult] = await Promise.all([
        api.getAssignments(),
        api.getAccounts(),
        api.getUsers(),
      ])
      setRows(assignmentResult.assignments)
      setAccounts(accountResult.accounts)
      const nonAdminUsers = userResult.users.filter((u) => u.role !== 'admin')
      setUsers(nonAdminUsers)
      if (!selectedUserId && nonAdminUsers.length > 0) {
        setSelectedUserId(nonAdminUsers[0].id)
      }
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to load access data')
    }
  }

  useEffect(() => {
    void refresh()
  }, [offline])

  // Filtered operators by search query
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users
    const query = userSearch.toLowerCase()
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    )
  }, [users, userSearch])

  // Currently focused operator
  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) ?? users[0] ?? null
  }, [users, selectedUserId])

  // Accounts assigned to the focused operator
  const userAssignments = useMemo(() => {
    if (!selectedUser) return []
    return rows.filter((r) => r.userId === selectedUser.id)
  }, [rows, selectedUser])

  // Accounts available to grant to this operator (not yet assigned)
  const availableAccountsForUser = useMemo(() => {
    const assignedIds = new Set(
      userAssignments.filter((r) => r.status === 'active').map((r) => r.accountId)
    )
    return accounts.filter((a) => !assignedIds.has(a.id))
  }, [accounts, userAssignments])

  // Grant account access
  const handleGrantAccess = async (accountId: string, expiresAt: string | null) => {
    if (!selectedUser) return
    setSaving(true)
    try {
      await api.addAssignment({
        accountId,
        userId: selectedUser.id,
        expiresAt,
      })
      const targetAccount = accounts.find((a) => a.id === accountId)
      onToast(`Granted access to ${targetAccount?.name ?? 'account'} for ${selectedUser.displayName}`)
      await refresh()
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to grant access')
    } finally {
      setSaving(false)
    }
  }

  // Revoke account access
  const handleRevoke = async (accountId: string, userId: string, accountName: string, userName?: string) => {
    const key = `${accountId}-${userId}`
    setRevokingKey(key)
    try {
      await api.revokeAssignment(accountId, userId)
      onToast(`Revoked access to ${accountName} from ${userName ?? selectedUser?.displayName ?? 'user'}`)
      await refresh()
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to revoke access')
    } finally {
      setRevokingKey(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h1 className="display-title mt-3">User Account Assignments</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Inspect assigned accounts per operator, grant new permissions, and revoke access instantly.
          </p>
        </div>

        {/* View Switcher */}
        <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setViewMode('by-user')}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === 'by-user'
                ? 'bg-cyan-400/20 text-cyan-200 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            By User (Operator Dossier)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === 'all'
                ? 'bg-cyan-400/20 text-cyan-200 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Assignments ({rows.filter((r) => r.status === 'active').length})
          </button>
        </div>
      </div>

      {viewMode === 'by-user' ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
          <OperatorSelector
            users={filteredUsers}
            selectedUserId={selectedUser?.id ?? ''}
            onSelectUser={setSelectedUserId}
            search={userSearch}
            onSearchChange={setUserSearch}
            getAssignmentCount={(id) => rows.filter((r) => r.userId === id && r.status === 'active').length}
          />

          {selectedUser ? (
            <div className="flex flex-col gap-6">
              <GlassCard className="p-5 sm:p-6">
                <OperatorDossierHeader
                  user={selectedUser}
                  activeAssignmentsCount={userAssignments.filter((r) => r.status === 'active').length}
                />
                <GrantAccessForm
                  userName={selectedUser.displayName}
                  availableAccounts={availableAccountsForUser}
                  onGrant={handleGrantAccess}
                  saving={saving}
                  offline={offline}
                />
              </GlassCard>

              <AssignedAccountsList
                userName={selectedUser.displayName}
                assignments={userAssignments}
                accounts={accounts}
                onRevoke={(accId, usrId, accName) => handleRevoke(accId, usrId, accName, selectedUser.displayName)}
                revokingKey={revokingKey}
                offline={offline}
              />
            </div>
          ) : (
            <GlassCard className="p-12 text-center text-slate-500">
              <p className="text-sm">Select an operator from the left to view and manage their account access.</p>
            </GlassCard>
          )}
        </div>
      ) : (
        <div className="mt-8">
          <GlobalAssignmentsTable
            assignments={rows}
            onRevoke={handleRevoke}
            revokingKey={revokingKey}
            offline={offline}
          />
        </div>
      )}
    </div>
  )
}
