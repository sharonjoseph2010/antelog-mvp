import { Helmet } from "react-helmet-async";

const ListsNew = () => {
  return (
    <>
      <Helmet>
        <title>Create New List | Antelog</title>
        <meta name="description" content="Create a new Antelog list." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-3xl font-bold">Create a New List</h1>
          <p className="text-muted-foreground">We’ll build this soon.</p>
        </section>
      </main>
    </>
  );
};

export default ListsNew;
