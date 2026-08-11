import { useEffect, useState } from "react";
import { Flex, FlexItem } from "@patternfly/react-core";

const IST = "Asia/Kolkata";

function partsInIst(now: Date) {
  const dtf = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = Number(map.hour ?? "0");
  let greeting = "Good evening";
  if (hour >= 5 && hour < 12) greeting = "Good morning";
  else if (hour >= 12 && hour < 17) greeting = "Good afternoon";
  else if (hour >= 17 && hour < 21) greeting = "Good evening";
  else greeting = "Good night";

  const date = `${map.weekday}, ${map.day} ${map.month} ${map.year}`;
  const time = `${map.hour}:${map.minute}:${map.second}`;
  return { greeting, date, time };
}

/** IST greeting + live digital date/time for the masthead. */
export function IstGreetingClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { greeting, date, time } = partsInIst(now);

  return (
    <Flex
      direction={{ default: "column" }}
      alignItems={{ default: "alignItemsFlexEnd" }}
      gap={{ default: "gapNone" }}
      className="ibmz-ist-clock"
    >
      <FlexItem>
        <span className="ibmz-ist-greeting">{greeting}</span>
      </FlexItem>
      <FlexItem>
        <span
          className="ibmz-ist-time"
          aria-live="polite"
          aria-label={`Indian Standard Time ${date} ${time}`}
        >
          {time}
        </span>
        <span className="ibmz-ist-tz">IST</span>
      </FlexItem>
      <FlexItem>
        <span className="ibmz-ist-date">{date}</span>
      </FlexItem>
    </Flex>
  );
}
