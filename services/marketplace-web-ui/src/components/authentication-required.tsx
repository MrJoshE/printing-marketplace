
import { useAuth } from "@/lib/auth/useAuth";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader } from "./ui/card";

export function AuthenticationRequired({ message }: { message?: string }) {
    const {login, register} = useAuth();
    return (
        <Card className="flex flex-col gap-2 p-6 max-w-md text-center"> 
            <CardHeader>
                <h2 className="text-xl font-medium">Authentication Required</h2>
            </CardHeader>
            <CardContent>
                <p className="text-base text-muted-foreground">{message ?? "You must be logged in to access this page."}</p>
            </CardContent>
            <CardFooter className="mt-2">
                <CardAction className="flex items-center justify-center w-full flex-col gap-2">
                    <Button onClick={() => login()}>Go to Login</Button>
                    <Button variant={'link'}  onClick={() => register()}>Have an account? Register</Button>
                </CardAction>
            </CardFooter>
        </Card>
    )
}