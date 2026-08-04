import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css"; 

const WebApp = (window as any).Telegram.WebApp;

interface Room {
  id: string;
  name: string;
  basePricePerHour: number;
}

// Новый интерфейс для хранения сырых данных о бронях
interface BookingDate {
  start: Date;
  end: Date;
}

function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  
  const [clientName, setClientName] = useState(WebApp.initDataUnsafe?.user?.first_name || '');
  const [clientPhone, setClientPhone] = useState('');
  const [guests, setGuests] = useState(1);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Сохраняем и заблокированные дни, и оригинальные брони
  const [bookedDates, setBookedDates] = useState<Date[]>([]);
  const [roomBookings, setRoomBookings] = useState<BookingDate[]>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await fetch('https://localhost:7045/api/rooms');
        if (response.ok) {
          const data = await response.json();
          setRooms(data);
          if (data.length > 0) setSelectedRoomId(data[0].id);
        }
      } catch (error) {
        console.error("Ошибка загрузки комнат:", error);
      }
    };
    fetchRooms();
  }, []);

  useEffect(() => {
    const fetchBookings = async () => {
      if (!selectedRoomId) return;
      
      try {
        const response = await fetch(`https://localhost:7045/api/bookings/room/${selectedRoomId}`);
        if (response.ok) {
          const bookingsData = await response.json();
          
          // Парсим даты из базы
          const parsedBookings = bookingsData.map((b: any) => ({
            start: new Date(b.startTime),
            end: new Date(b.endTime)
          }));
          setRoomBookings(parsedBookings);

          const disabledDatesArray: Date[] = [];

          // Генерируем массив занятых дней (только для календаря ЗАЕЗДА)
          parsedBookings.forEach((b: BookingDate) => {
            let currentDate = new Date(b.start);
            currentDate.setHours(0, 0, 0, 0); // Обнуляем часы для точного сравнения
            
            const stopDate = new Date(b.end);
            stopDate.setHours(0, 0, 0, 0);

            while (currentDate < stopDate) {
              disabledDatesArray.push(new Date(currentDate));
              currentDate.setDate(currentDate.getDate() + 1);
            }
          });

          setBookedDates(disabledDatesArray);
          setStartDate(null);
          setEndDate(null);
        }
      } catch (error) {
        console.error("Ошибка загрузки броней:", error);
      }
    };
    fetchBookings();
  }, [selectedRoomId]);

  // --- ВЫЧИСЛЕНИЕ ДИНАМИЧЕСКИХ ОГРАНИЧЕНИЙ ДЛЯ ВЫЕЗДА ---
  let minCheckoutDate = new Date();
  let maxCheckoutDate: Date | null = null; // По умолчанию нет ограничения (можно жить хоть год)

  if (startDate) {
    // 1. Минимальная дата выезда — следующий день после заезда
    minCheckoutDate = new Date(startDate);
    minCheckoutDate.setDate(minCheckoutDate.getDate() + 1);

    // 2. Ищем, есть ли чужая бронь ПОСЛЕ нашего заезда
    const nextBooking = roomBookings
      .filter(b => b.start > startDate)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0]; // Берем самую ближайшую

    if (nextBooking) {
      // Если кто-то заезжает, мы обязаны выехать не позднее дня их заезда
      maxCheckoutDate = new Date(nextBooking.start);
    }
  }
  // -----------------------------------------------------

  const handleBooking = async () => {
    if (!selectedRoomId || !clientName || !clientPhone || !startDate || !endDate) {
      alert("Пожалуйста, заполните все поля");
      return;
    }

    const startDateTime = new Date(startDate);
    startDateTime.setHours(12, 0, 0, 0);
    
    const endDateTime = new Date(endDate);
    endDateTime.setHours(10, 0, 0, 0);

    const bookingData = {
      roomId: selectedRoomId, 
      clientTgId: WebApp.initDataUnsafe?.user?.id || 0,
      clientName: clientName,     
      clientPhone: clientPhone,   
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      guestsCount: guests
    };

    try {
      const response = await fetch('https://localhost:7045/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });

      if (response.ok) {
        alert("Заявка успешно отправлена!");
        WebApp.close(); 
      } else {
        const errorText = await response.text();
        alert(`Ошибка: ${errorText}`);
      }
    } catch (error) {
      alert("Ошибка соединения с сервером");
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '400px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Бронирование зала</h2>

      <div style={{ marginBottom: '15px' }}>
        <label>Выберите помещение:</label><br/>
        <select 
          value={selectedRoomId} 
          onChange={(e) => setSelectedRoomId(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px' }}
        >
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Ваше имя:</label><br/>
        <input 
          type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
          style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>Контактный телефон:</label><br/>
        <input 
          type="tel" 
          value={clientPhone} 
          onChange={(e) => {
            // Удаляем всё, кроме цифр и знака "+"
            const onlyNumbersAndPlus = e.target.value.replace(/[^\d+]/g, '');
            setClientPhone(onlyNumbersAndPlus);
          }}
          style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ width: '48%' }}>
          <label style={{ fontSize: '14px' }}>Заезд <br/><small>(с 12:00)</small>:</label><br/>
          <DatePicker 
            selected={startDate}
            onChange={(date) => {
              setStartDate(date);
              setEndDate(null); // Сбрасываем выезд при изменении заезда
            }}
            minDate={new Date()} 
            excludeDates={bookedDates} // Блокируем занятые дни для заезда
            dateFormat="dd.MM.yyyy"
            className="custom-datepicker"
            placeholderText="Выберите день"
          />
        </div>
        <div style={{ width: '48%' }}>
          <label style={{ fontSize: '14px' }}>Выезд <br/><small>(до 10:00)</small>:</label><br/>
          <DatePicker 
            selected={endDate}
            onChange={(date) => setEndDate(date)}
            minDate={minCheckoutDate} // Нельзя выехать раньше следующего дня
            maxDate={maxCheckoutDate || undefined} // Нельзя выехать позже следующей брони
            disabled={!startDate} // Блокируем календарь, пока не выбран заезд!
            dateFormat="dd.MM.yyyy"
            className="custom-datepicker"
            placeholderText="Выберите день"
          />
        </div>
      </div>
      
      <style>{`
        .custom-datepicker {
          width: 100%;
          padding: 8px;
          margin-top: 5px;
          border-radius: 4px;
          box-sizing: border-box;
          border: 1px solid #767676;
        }
        /* Делаем отключенный инпут визуально серым */
        .custom-datepicker:disabled {
          background-color: #e9ecef;
          cursor: not-allowed;
        }
      `}</style>

      <div style={{ marginBottom: '25px' }}>
        <label>Количество гостей:</label><br/>
        <select 
          value={guests} onChange={(e) => setGuests(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px', boxSizing: 'border-box' }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => <option key={num} value={num}>{num}</option>)}
        </select>
      </div>

      <button 
        onClick={handleBooking}
        disabled={rooms.length === 0}
        style={{
          width: '100%', padding: '14px', 
          backgroundColor: rooms.length === 0 ? '#ccc' : (WebApp.themeParams?.button_color || '#2481cc'),
          color: WebApp.themeParams?.button_text_color || '#fff',
          border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
        }}
      >
        Забронировать
      </button>
    </div>
  );
}

export default App;