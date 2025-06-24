export async function fetchLambdas() {
    console.log("fetchLambdas");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas` // TODO: get clientId from url or from the auth context
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des lambdas");
  return res.json();
}

export async function fetchLambdaDetails(lambdaId: string) {
  console.log("fetchLambdaDetails pour lambda:", lambdaId);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des détails de la lambda");
  return res.json();
}

export async function updateLambda(lambdaId: string, config: Record<string, string>) {
  const requestBody = { config };
  console.log("updateLambda - Request URL:", `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`);
  console.log("updateLambda - Request Body:", JSON.stringify(requestBody, null, 2));
  
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("updateLambda - Error Response:", {
      status: res.status,
      statusText: res.statusText,
      body: errorText
    });
    throw new Error(`Erreur lors de la mise à jour de la lambda: ${errorText}`);
  }
  
  const responseData = await res.json();
  console.log("updateLambda - Success Response:", responseData);
  return responseData;
}

export async function fetchLambdaLogs(lambdaId: string) {
  console.log("fetchLambdaLogs pour lambda:", lambdaId);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}/logs`
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des logs de la lambda");
  return res.json();
} 