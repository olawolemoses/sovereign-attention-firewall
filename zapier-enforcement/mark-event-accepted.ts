// Define an async function to update a calendar event's attendee response status to 'Accepted'
export async function updateEventStatusToAccepted({
  calendarId,
  eventId
}: {
  calendarId: string;
  eventId: string;
}): Promise<{ result: string }> {
  // Construct the URL with the provided calendarId and eventId
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  // Define the request body to update the attendee's response status to 'Accepted'
  const requestBody = {
    attendees: [
      {
        email: calendarId, // Use the calendarId as the email for the attendee
        responseStatus: "accepted" // Set the response status to 'accepted'
      }
    ]
  };

  // Make the PATCH request using fetchWithZapier
  const response = await fetchWithZapier(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  // Throw an error if the response is not ok
  await response.throwErrorIfNotOk();

  // Return a success message
  return { result: "Attendee response status updated to 'Accepted'" };
}
