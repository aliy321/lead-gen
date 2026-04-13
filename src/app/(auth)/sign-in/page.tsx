"use client";

import { useState } from "react";
import { authClient } from "~/server/better-auth/client";

export default function SignInPage() {
	const [isLoading, setIsLoading] = useState(false);

	const handleGoogleSignIn = async () => {
		setIsLoading(true);
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: "/dashboard",
			});
		} catch (error) {
			console.error("Sign in error:", error);
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-linear-to-b from-[#2e026d] to-[#15162c]">
			<div className="bg-white/10 p-8 rounded-xl shadow-xl max-w-md w-full">
				<h1 className="text-3xl font-bold text-white text-center mb-2">
					Welcome
				</h1>
				<p className="text-white/70 text-center mb-8">
					Sign in to access your leads
				</p>

				<button
					type="button"
					onClick={handleGoogleSignIn}
					disabled={isLoading}
					className="w-full bg-white text-gray-800 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
				>
					{isLoading ? "Signing in..." : "Sign in with Google"}
				</button>
			</div>
		</div>
	);
}
