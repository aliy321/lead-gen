import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from 'next/font/google'

import { TRPCReactProvider } from "~/trpc/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { cn } from "~/lib/utils";
import Providers from "~/components/Providers";

const geistMonoHeading = Geist_Mono({ subsets: ['latin'], variable: '--font-heading' });

export const metadata: Metadata = {
	title: "Lead Finder",
	description:
		"Lead Finder is a tool that helps you find leads for your business.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
	variable: '--font-geist-sans',
	style: 'normal',
	display: 'swap',
	preload: true,
})

const geistMono = Geist_Mono({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
	variable: '--font-geist-mono',
	style: 'normal',
	display: 'swap',
	preload: true,
})

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			data-scroll-behavior='smooth'
			className={cn(geist.variable, geistMono.variable, geistMonoHeading.variable)}
			suppressHydrationWarning
		>
			<body>
				<Providers>
					{children}
				</Providers>
			</body>
		</html>
	);
}
