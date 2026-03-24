// Define and export an async function to update the RSVP status of an attendee to 'declined' for a specific event.
export async function updateEventRSVPStatus({
  calendarId,
  eventId
}: {
  calendarId: string;
  eventId: string;
}): Promise<{ result: any }> {
  // Construct the URL using the provided calendarId and eventId.
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  // Define the request body to update the attendee's response status to 'declined'.
  const requestBody = {
    attendees: [
      {
        email: calendarId, // Use the calendarId as the attendee's email.
        responseStatus: "declined" // Set the response status to 'declined'.
      }
    ]
  };

  // Use fetchWithZapier to send a PATCH request to the API endpoint.
  const response = await fetchWithZapier(url, {
    method: 'PATCH', // PATCH only updates the fields you provide
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  // Throw an error if the response is not OK.
  await response.throwErrorIfNotOk();

  // Return the updated event data as the result.
  return { result: await response.json() };
}
