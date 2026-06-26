import { IoIosSearch } from "react-icons/io";

type SearchbarProps = {};

const Searchbar = (props: SearchbarProps) => {
    const { } = props;
    return <>
        <div className="searchbar">
            <input className="searchbar-input" type="text" placeholder="חפש משימות..." />
            <IoIosSearch />
        </div>
    </>;
};

export default Searchbar;