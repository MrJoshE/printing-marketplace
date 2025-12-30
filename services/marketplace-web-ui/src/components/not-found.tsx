
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { Button } from "./ui/button";

export function NotFoundPage() {
	return (
		<div className="flex w-full items-center justify-center">
			<div className="flex h-screen items-center border-x">
				<div>
					<div className="absolute inset-x-0 h-px bg-border" />
					<Empty>
						<EmptyHeader>
							<EmptyTitle className="font-mono text-8xl text-primary mb-4 max-w-2xl">
								Not Found
							</EmptyTitle>
							<EmptyDescription className="text-nowrap text-md">
								The page you're looking for might have been <br />
								moved or doesn't exist.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<div className="flex w">
								<Button asChild variant={'outline'} size={'lg'}>
									<Link to={"/"}>
										<Home /> Go Home
									</Link>
								</Button>

							</div>
						</EmptyContent>
					</Empty>
					<div className="absolute inset-x-0 h-px bg-border" />
				</div>
			</div>
		</div>
	);
}
