export async function fetchLambdas() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas` // TODO: get clientId from url or from the auth context
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des lambdas");
  return res.json();
} 