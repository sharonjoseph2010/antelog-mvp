import { Helmet } from "react-helmet-async";

const Lists = () => {
  return (
    <>
      <Helmet>
        <title>My Lists | Antelog</title>
        <meta name="description" content="View and manage your Antelog lists." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-3xl font-bold">My Lists</h1>
          <p className="text-muted-foreground">Coming soon: create and manage your lists here.</p>
        </section>
      </main>
    </>
  );
};

export default Lists;
