import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

interface ListingCreatorProps {
  name: string
  avatarUrl: string
  bio: string
  followers: number
  rating: number
}

export function ListingCreator({ name, avatarUrl, bio, followers, rating }: ListingCreatorProps) {
  return (
    <div className="mt-8 flex flex-col items-center gap-6 rounded-xl border bg-muted/30 p-6 sm:flex-row sm:items-start text-center sm:text-left">
      <Avatar className="h-16 w-16 border-2 border-background">
        <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
        <AvatarFallback>{name.slice(0,2).toUpperCase()}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1">
        <h4 className="text-lg font-bold">{name}</h4>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{bio}</p>
        <div className="flex flex-wrap justify-center sm:justify-start gap-3">
          <Button variant="default" size="sm" className="font-bold">Follow</Button>
          <Button variant="outline" size="sm">View Profile</Button>
        </div>
      </div>

      <div className="flex w-full justify-center gap-4 border-t pt-4 sm:w-auto sm:flex-col sm:gap-2 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
        <div>
          <div className="text-xl font-bold">{followers.toLocaleString()}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Followers</div>
        </div>
        <div>
          <div className="text-xl font-bold">{rating}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Rating</div>
        </div>
      </div>
    </div>
  )
}