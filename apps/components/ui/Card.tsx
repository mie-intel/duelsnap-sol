interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Card({
  children,
  className = "",
  onClick,
  style,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={[
        "bg-bg-card rounded-2xl shadow-sm p-6",
        onClick
          ? "cursor-pointer hover:shadow-md transition-shadow duration-150"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
