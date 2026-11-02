import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase">
        Company A · Ahmedabad
      </p>
      <h1 className="text-5xl font-light">Find a home that feels like yours.</h1>
      <p className="text-muted-foreground text-lg">ઘર જે તમારું લાગે · ऐसा घर जो आपका लगे</p>
      <div className="flex gap-3">
        <Button>Book a site visit</Button>
        <Button variant="outline">Ask the assistant</Button>
      </div>
    </main>
  );
}
