// FILE: tests/frontend/ui.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Smoke-test M-UI primitives for rendering, accessibility roles, and basic interactions.
//   SCOPE: Deterministic jsdom tests for src/components/ui primitives.
//   DEPENDS: src/components/ui, @testing-library/react, vitest
//   LINKS: M-UI, V-M-UI
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-UI primitives) - smoke checks for base components and accessibility roles.
// END_MODULE_MAP
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Label,
  Progress,
  ScrollArea,
  Select,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Toast,
  Tooltip,
  cn
} from '../../src/components/ui'

describe('M-UI primitives', () => {
  it('renders action and form primitives with accessible roles', () => {
    const onClick = vi.fn()

    render(
      <form>
        <Label htmlFor="model">Model</Label>
        <Input id="model" defaultValue="large-v3" />
        <Select aria-label="Language" defaultValue="ru">
          <option value="ru">Русский</option>
        </Select>
        <Switch checked aria-label="Watch folder" />
        <Button onClick={onClick}>Run</Button>
      </form>
    )

    expect(screen.getByLabelText('Model')).toHaveProperty('value', 'large-v3')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveProperty('value', 'ru')
    expect(screen.getByRole('combobox', { name: 'Language' }).className).toContain('h-8')
    expect(screen.getByRole('switch', { name: 'Watch folder' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders display primitives and dark-theme class hooks', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="success">Ready</Badge>
          <Progress value={25} />
          <Separator />
        </CardContent>
      </Card>
    )

    expect(screen.getByText('Transcript')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    expect(screen.getByTestId('card').className).toContain('dark:bg-zinc-950')
  })

  it('renders navigation, dialog, table, tooltip, toast, and scroll area primitives', () => {
    render(
      <div>
        <Tabs value="upload">
          <TabsList>
            <TabsTrigger value="upload" selected>
              Upload
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog open title="Settings">
          <p>GPU only</p>
        </Dialog>
        <ScrollArea style={{ maxHeight: 120 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Speaker</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>SPEAKER_00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ScrollArea>
        <Tooltip content="Copied">
          <span>Copy</span>
        </Tooltip>
        <Toast title="Done" description="Export complete" />
      </div>
    )

    expect(screen.getByRole('tab', { name: 'Upload' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Speaker' })).toBeTruthy()
    expect(screen.getByTitle('Copied')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Done')
  })

  it('joins class names without falsey values', () => {
    expect(cn('base', false, undefined, null, 'active')).toBe('base active')
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Added compact Select regression assertion for Heritage controls.
// END_CHANGE_SUMMARY
