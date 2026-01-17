export function DescriptionTab({ description }: { description: string }) {
  return <div className="prose dark:prose-invert max-w-none" >
    <p className="text-base">{description}</p>
  </div>
}