import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MethodTag, SeverityBadge, StatusBadge, TypeTag } from "./Badges"

describe('SeverityBadge', () => {
    it('shows polish label and tone for known severity', () => {
        render(<SeverityBadge severity="CRITICAL" />)

        const badge = screen.getByText('Krytyczny')
        expect(badge).toHaveAttribute('data-tone', 'critical')
    })

    it('shows raw value with neutral tone for unknown severity', () => {
        render(<SeverityBadge severity={null} raw="WEIRD" />)

        expect(screen.getByText('WEIRD')).toHaveAttribute('data-tone', 'info')
    })

    it('shows dash when there is no value at all', () => {
        render(<SeverityBadge severity={null} raw={null} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })
})

describe('StatusBadge', () => {
    it('shows polish label and tone for known status', () => {
        render(<StatusBadge status="FALSE_POSITIVE" />)

        expect(screen.getByText('Fałszywy alarm')).toHaveAttribute('data-tone', 'false_positive')
    })

    it('shows raw value with neutral tone for unknown status', () => {
        render(<StatusBadge status={null} raw="ARCHIVED" />)

        expect(screen.getByText('ARCHIVED')).toHaveAttribute('data-tone', 'info')
    })

    it('shows dash when there is no value at all', () => {
        render(<StatusBadge status={null} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })
})

describe('TypeTag', () => {
    it('shows polish label for known type', () => {
        render(<TypeTag type="BRUTE_FORCE" />)

        expect(screen.getByText('Brute force')).toBeInTheDocument()
    })

    it('shows unknown type unchanged', () => {
        render(<TypeTag type="SQL_INJECTION" />)

        expect(screen.getByText('SQL_INJECTION')).toBeInTheDocument()
    })

    it('shows dash for missing type', () => {
        render(<TypeTag type={null} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })
})

describe('MethodTag', () => {
    it('shows polish label for known method', () => {
        render(<MethodTag method="statistical" />)

        expect(screen.getByText('Statystyczna')).toBeInTheDocument()
    })

    it('shows unknown method unchanged', () => {
        render(<MethodTag method="custom" />)

        expect(screen.getByText('custom')).toBeInTheDocument()
    })

    it('shows dash for missing method', () => {
        render(<MethodTag method={undefined} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })
})