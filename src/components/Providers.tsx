import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import React, { type PropsWithChildren } from 'react'
import { TRPCReactProvider } from '~/trpc/react'

const Providers = ({ children }: PropsWithChildren) => {
    return (
        <TRPCReactProvider>
            <NuqsAdapter>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    {children}
                </ThemeProvider>
            </NuqsAdapter>
        </TRPCReactProvider>
    )
}

export default Providers