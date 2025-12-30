import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
} 

export const MARKETPLACE_CONFIG = Object.freeze({
    authorization: {
        url: "http://authorization.infrastructure.orb.local",
        realm: "marketplace",             
        clientId: "marketplace-web",         
    },
    typesense: {
        public_key: "",
        host: "localhost",
        connectionTimeout: 2,
        port: 8108,
        protocol: "http"
    }
})

export function formatCurrency(
    amountMinUnit: number,  
    currency: string = "USD",
    locale: string = "en-US"
): string {
    const amount = amountMinUnit / 100;
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
    }).format(amount);
}