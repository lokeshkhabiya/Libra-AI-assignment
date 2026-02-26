import Header from "@/components/header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<Header />
			<main className="flex-1 overflow-hidden">{children}</main>
		</>
	);
}
